/* eslint-disable jsdoc/require-jsdoc -- Agreement Submission command boundary. */
import { isDeepStrictEqual } from 'node:util'
import { isError, type H3Event } from 'h3'
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type {
  AgreementSubmissionPayload,
  AgreementSubmissionTable,
  ClaimSubmissionReferenceSnapshot
} from '~~/shared/types/agreement-submission-database'
import type {
  AgreementSubmissionBudgetPreview,
  AgreementSubmissionBudgetPreviewInput,
  AgreementSubmissionCommand,
  AgreementSubmissionEventKind,
  AgreementSubmissionList,
  AgreementSubmissionListQuery,
  AgreementSubmissionReceipt
} from '~~/shared/types/agreement-submission'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import { agreementSubmissionTargetSchemas } from '~~/shared/types/schemas/agreement-submission-targets'
import { readClaimSubmissionEvidence } from './agreement-submission-claim-evidence'
import { assertClaimCustomFieldsComplete, parsePersistedClaimCustomFieldDefinitions } from './agreement-claim-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource, canAccessAgreement, resolveAgreementScopeContext, type AgreementScopeContext } from './agreement'
import { hasActiveAgreementCloseoutWorkflow } from './agreement-closeout'
import {
  assertAgreementCloseoutWriteAllowed,
  authorizeFreshAgreementUpdate,
  executeFreshAuthorizedAgreementWrite
} from './agreement-write-transaction'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, type AuthContext } from './authorize'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import {
  applyAgreementSubmissionTarget,
  previewAgreementSubmissionBudget,
  readAgreementSubmissionBudgetRevision,
  SubmissionTargetError
} from './agreement-submission-targets'
import { assertBusinessStatusMutationAllowed, BusinessStatusViolation } from './business-status-runtime'
import { resolveAssignedItemTargetGrant } from './rbac'
import {
  applyLinkedSubmissionRevision,
  assertLinkedSubmissionTargetEditable,
  linkedSubmissionDecisionDigest,
  readLinkedSubmissionSnapshot
} from './agreement-linked-submission-targets'

type Submission = Selectable<AgreementSubmissionTable>
type SubmissionDb = Kysely<Database>

const evidenceOnly = {
  allowDuringCloseout: true,
  businessStatusMode: 'submission_evidence'
} as const

const conflict = (event: H3Event, code: string, key: string) => throwApiError(event, { statusCode: 409, code, key })

const missingAgreement = (event: H3Event) => notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

const targetAssignment = (target: 'claim' | 'forecast', targetId: string) => ({
  entityType: target === 'claim' ? 'fundingcaseagreementclaim' as const : 'fundingcaseforecast' as const,
  entityId: targetId
})

const financialTarget = (submission: Submission) => {
  const { egcs_fc_target: target, egcs_fc_result: targetId } = submission
  return target !== 'amendment_budget' && targetId ? { target, targetId } : null
}

const readSubmissionPolicy = async (db: SubmissionDb, streamId: string) =>
  (await db.selectFrom('Transfer_Payment_Stream').select('egcs_tp_submissionpolicy')
    .where('id', '=', streamId).executeTakeFirstOrThrow()).egcs_tp_submissionpolicy

const allowsReturn = async (db: SubmissionDb, streamId: string, target: 'claim' | 'forecast') =>
  (await readSubmissionPolicy(db, streamId))[target] !== 'automatic'

const canReviewLinkedTarget = async (db: SubmissionDb, auth: AuthContext, context: AgreementScopeContext, target: 'claim' | 'forecast', targetId: string) =>
  auth.userAbilities.authorize('agreement', 'update', context.scope)
  && (await resolveAssignedItemTargetGrant(auth.userId, targetAssignment(target, targetId), db))?.actions.has('update') === true

const readSubmission = async (event: H3Event, db: SubmissionDb, agreementId: string, submissionId: string, lock = false) => {
  if (!isPositivePostgresBigintText(submissionId)) {
    return await notFound(event, 'SUBMISSION_NOT_FOUND', 'submission.errors.not_found')
  }
  const row = await db.selectFrom('Funding_Case_Agreement_Submission').selectAll()
    .where('id', '=', submissionId).where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false).$if(lock, query => query.forUpdate()).executeTakeFirst()
  return row ?? await notFound(event, 'SUBMISSION_NOT_FOUND', 'submission.errors.not_found')
}

const submissionDto = ({
  egcs_fc_resultamendment: _resultAmendment,
  egcs_fc_resultforecast: _resultForecast,
  egcs_fc_resultclaim: _resultClaim,
  ...row
}: Submission) => ({
  ...row,
  egcs_fc_updatedat: new Date(row.egcs_fc_updatedat).toISOString()
})

const detail = async (db: SubmissionDb, submission: Submission, canReview: boolean, canReturn: boolean = canReview) => {
  const events = await db.selectFrom('Funding_Case_Agreement_Submission_Event as entry')
    .leftJoin('Common_User as actor', 'actor.id', 'entry.egcs_fc_actor')
    .selectAll('entry').select('actor.egcs_cn_name as actorName')
    .where('entry.egcs_fc_submission', '=', submission.id).where('entry._deleted', '=', false)
    .orderBy('entry.id', 'asc').execute()
  const updatedBy = submission.egcs_fc_updatedby
    ? await db.selectFrom('Common_User').select('egcs_cn_name').where('id', '=', submission.egcs_fc_updatedby).executeTakeFirst()
    : null
  return {
    submission: submissionDto(submission),
    updatedByName: updatedBy?.egcs_cn_name ?? null,
    events: events.map(entry => ({ ...entry, egcs_fc_createdat: new Date(entry.egcs_fc_createdat).toISOString() })),
    canReview,
    canReturn
  }
}

const appendEvent = async (
  trx: Transaction<Database>,
  submission: Submission,
  kind: AgreementSubmissionEventKind,
  description: string | null = null
) => {
  const evidence = kind !== 'review_started' && submission.egcs_fc_target === 'claim' && submission.egcs_fc_result
    ? await readClaimSubmissionEvidence(trx, submission.egcs_fc_result, parsePersistedClaimCustomFieldDefinitions)
    : null
  await trx.insertInto('Funding_Case_Agreement_Submission_Event').values({
    egcs_fc_claimcustomfields: evidence?.fields.length ? sql<ClaimCustomFieldSnapshot>`${JSON.stringify(evidence.fields)}::jsonb` : null,
    egcs_fc_claimreferences: evidence ? sql<ClaimSubmissionReferenceSnapshot>`${JSON.stringify(evidence.references)}::jsonb` : null,
    egcs_fc_submission: submission.id,
    egcs_fc_kind: kind,
    egcs_fc_sourcerevision: submission.egcs_fc_sourcerevision,
    egcs_fc_formatversion: submission.egcs_fc_formatversion,
    egcs_fc_payload: kind === 'review_started' ? null : submission.egcs_fc_payload,
    egcs_fc_description: description,
    egcs_fc_actor: submission.egcs_fc_updatedby,
    egcs_fc_amendment: submission.egcs_fc_amendment,
    egcs_fc_budgetrevision: submission.egcs_fc_budgetrevision
  }).execute()
}

const currentPrimary = async (trx: Transaction<Database>, agreementId: string) => {
  const primary = await trx.selectFrom('Common_Entity_Assignment as assignment')
    .innerJoin('Common_User as common_user', 'common_user.id', 'assignment.egcs_cn_user')
    .innerJoin('user as auth_user', 'auth_user.id', 'common_user.egcs_cn_authuserid')
    .select('assignment.egcs_cn_user')
    .where('assignment.egcs_cn_entitytype', '=', 'fundingcaseagreement')
    .where('assignment.egcs_cn_entityid', '=', agreementId)
    .where('assignment.egcs_cn_isprimary', '=', true)
    .where('assignment._deleted', '=', false)
    .where('common_user._deleted', '=', false)
    .where('auth_user._deleted', '=', false)
    .forUpdate('assignment').executeTakeFirst()
  return primary?.egcs_cn_user ?? null
}

const expectedTargetError = (error: unknown): string | null => {
  if (error instanceof SubmissionTargetError) {
    return error.code
  }
  if (error instanceof BusinessStatusViolation) {
    return error.code
  }
  if (isError(error) && [400, 404, 409, 422].includes(error.statusCode)) {
    const data = error.data
    const code = typeof data === 'object' && data !== null && 'code' in data ? data.code : null
    if (typeof code === 'string') return code
  }
  return null
}

const surfaceTargetError = async <T>(event: H3Event, work: () => Promise<T>) => {
  try {
    return await work()
  } catch (error: unknown) {
    if (error instanceof SubmissionTargetError) {
      return await conflict(event, error.code, `submission.blocker.${error.code}`)
    }
    if (error instanceof BusinessStatusViolation) {
      return await conflict(event, error.code, 'apiErrors.request.invalid_status')
    }
    throw error
  }
}

const materializeAmendment = async (
  event: H3Event,
  trx: Transaction<Database>,
  submission: Submission,
  owner: { agencyId: string, streamId: string },
  accepted: {
    payload: AgreementSubmissionPayload
    amendmentId: string | null
    expectedBudgetRevision: string | null
    expectedBudgetConfirmation?: string
    actorUserId: string | null
    actor: string | null
  }
) => {
  if (submission.egcs_fc_formatversion !== 1) return await conflict(event, 'SUBMISSION_FORMAT', 'submission.errors.format')
  if (!accepted.amendmentId) {
    return await conflict(event, 'SUBMISSION_AMENDMENT_REQUIRED', 'submission.errors.amendment_required')
  }
  const agreementId = submission.egcs_fc_fundingagreement
  const result = await applyAgreementSubmissionTarget(trx, {
    event,
    agreementId,
    ...owner,
    target: 'amendment_budget',
    payload: accepted.payload,
    amendmentId: accepted.amendmentId,
    expectedBudgetRevision: accepted.expectedBudgetRevision,
    expectedBudgetConfirmation: accepted.expectedBudgetConfirmation,
    budgetReview: accepted.expectedBudgetConfirmation
      ? { submissionId: submission.id, revision: submission.egcs_fc_revision, actorUserId: accepted.actorUserId }
      : undefined,
    primaryUserId: null,
    actorUserId: accepted.actorUserId
  })
  const row = await trx.updateTable('Funding_Case_Agreement_Submission').set({
    egcs_fc_state: 'accepted',
    egcs_fc_revision: submission.egcs_fc_revision + 1,
    egcs_fc_payload: accepted.payload,
    egcs_fc_amendment: accepted.amendmentId,
    egcs_fc_budgetrevision: accepted.expectedBudgetRevision,
    egcs_fc_updatedby: accepted.actor,
    egcs_fc_blocker: null,
    egcs_fc_result: result.id,
    egcs_fc_updatedat: new Date()
  }).where('id', '=', submission.id).returningAll().executeTakeFirstOrThrow()
  await appendEvent(trx, row, 'accepted')
  return row
}

const readAccess = async <T>(event: H3Event, agreementId: string, work: (
  db: Transaction<Database>, authorization: AuthContext, canReview: boolean, context: AgreementScopeContext
) => Promise<T>) =>
  await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const context = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true, freshAuthContext })
    if (!context) return await missingAgreement(event)
    const authorization = freshAuthContext ?? await requireAuthContext(event)
    const canReview = await canAccessAgreement(authorization, 'update', context.scope, db)
    return await work(db, authorization, canReview, context)
  })

export const listAgreementSubmissions = async (event: H3Event, agreementId: string, query: AgreementSubmissionListQuery): Promise<AgreementSubmissionList> =>
  await readAccess(event, agreementId, async (db, authorization, canReview, context) => {
    const linked = query.target ? query : null
    const collection = db.selectFrom('Funding_Case_Agreement_Submission as submission')
      .selectAll('submission')
      .select(eb => eb.or([
        eb.and([
          eb('submission.egcs_fc_target', '=', 'claim'),
          eb.exists(eb.selectFrom('Funding_Case_Agreement_Claim as claim').select('claim.id')
            .whereRef('claim.id', '=', 'submission.egcs_fc_result')
            .where('claim.egcs_fc_fundingagreement', '=', agreementId).where('claim._deleted', '=', false))
        ]),
        eb.and([
          eb('submission.egcs_fc_target', '=', 'forecast'),
          eb.exists(eb.selectFrom('Funding_Case_Agreement_Forecast as forecast').select('forecast.id')
            .whereRef('forecast.id', '=', 'submission.egcs_fc_result')
            .where('forecast.egcs_fc_fundingagreement', '=', agreementId).where('forecast._deleted', '=', false))
        ])
      ]).as('targetAvailable'))
      .where('submission.egcs_fc_fundingagreement', '=', agreementId).where('submission._deleted', '=', false)
    const rows = await (linked ? collection.where('egcs_fc_target', '=', linked.target).where('egcs_fc_result', '=', linked.targetId) : collection)
      .orderBy('egcs_fc_updatedat', 'desc').orderBy('id', 'desc').execute()
    const allowed = linked && rows.length > 0
      ? await canReviewLinkedTarget(db, authorization, context, linked.target, linked.targetId)
      : !linked && canReview
    return { items: rows.map(({ targetAvailable, ...row }) => ({ ...submissionDto(row), targetAvailable: Boolean(targetAvailable) })), canReview: allowed }
  })

export const getAgreementSubmission = async (event: H3Event, agreementId: string, submissionId: string) =>
  await readAccess(event, agreementId, async (db, authorization, canReview, context) => {
    const row = await readSubmission(event, db, agreementId, submissionId)
    const linked = financialTarget(row)
    if (!linked) return await detail(db, row, canReview)
    const allowed = await canReviewLinkedTarget(db, authorization, context, linked.target, linked.targetId)
    return await detail(db, row, allowed, allowed && await allowsReturn(db, context.streamId, linked.target))
  })

export const commandAgreementSubmission = async (
  event: H3Event, agreementId: string, submissionId: string, command: AgreementSubmissionCommand
) => {
  const db = event.context.$db
  if (!await authorizeAgreementResource(event, 'read', agreementId, db)) return await missingAgreement(event)
  const preliminary = await readSubmission(event, db, agreementId, submissionId)
  const linked = financialTarget(preliminary)
  const assignmentTarget = linked ? targetAssignment(linked.target, linked.targetId) : undefined
  const initial = await authorizeAgreementResource(event, 'update', agreementId, db, { assignmentTarget })
  if (!initial) return await missingAgreement(event)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initial, async (trx, current, auth) => {
    const submission = await readSubmission(event, trx, agreementId, submissionId, true)
    if (submission.egcs_fc_revision !== command.revision) return await conflict(event, 'SUBMISSION_STALE', 'submission.errors.stale')
    const state = command.action === 'start' ? 'submitted' : 'reviewing'
    if (submission.egcs_fc_state !== state) return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
    const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actor) return await forbidden(event)

    if (linked) {
      if (command.action === 'save' || ('payload' in command && command.payload !== undefined)
        || (command.action === 'accept' && (command.amendmentId || command.expectedBudgetRevision || command.expectedBudgetConfirmation))) {
        return await badRequest(event, 'SUBMISSION_NATIVE_EDITOR_REQUIRED', 'validation.invalid_selection')
      }
      const canReturn = await allowsReturn(trx, current.streamId, linked.target)
      if (command.action === 'return' && !canReturn) {
        return await conflict(event, 'SUBMISSION_RETURN_DISABLED', 'submission.errors.return_disabled')
      }
      if (command.action !== 'return') {
        await surfaceTargetError(event, () => assertLinkedSubmissionTargetEditable(trx, { event, agreementId, ...linked }))
      }
      const action = command.action
      const snapshot = action === 'start'
        ? submission.egcs_fc_payload
        : await surfaceTargetError(event, () =>
            readLinkedSubmissionSnapshot(trx, { agreementId, ...linked, sourcePayload: submission.egcs_fc_payload }))
      if (action !== 'start' && command.expectedDecisionDigest !== linkedSubmissionDecisionDigest(snapshot)) {
        return await conflict(event, 'SUBMISSION_FINANCIAL_STALE', 'submission.errors.financial_stale')
      }
      if (action === 'accept' && linked.target === 'claim') await assertClaimCustomFieldsComplete(event, trx, linked.targetId)
      const state = action === 'start' ? 'reviewing' : action === 'return' ? 'returned' : 'accepted'
      const row = await trx.updateTable('Funding_Case_Agreement_Submission').set({
        egcs_fc_state: state,
        egcs_fc_payload: snapshot,
        egcs_fc_updatedby: actor,
        egcs_fc_updatedat: new Date(),
        egcs_fc_revision: submission.egcs_fc_revision + 1
      }).where('id', '=', submissionId).returningAll().executeTakeFirstOrThrow()
      const eventKind = action === 'start' ? 'review_started' : action === 'return' ? 'returned' : 'accepted'
      await appendEvent(trx, row, eventKind, action === 'return' ? command.description : null)
      return await detail(trx, row, true, canReturn)
    }

    if ('expectedDecisionDigest' in command && command.expectedDecisionDigest !== undefined) {
      return await badRequest(event, 'SUBMISSION_INVALID_DECISION_PROOF', 'validation.invalid_selection')
    }

    if (submission.egcs_fc_formatversion !== 1 && (
      command.action === 'save' || (command.action === 'return' && command.payload
        && !isDeepStrictEqual(command.payload, submission.egcs_fc_payload))
    )) return await conflict(event, 'SUBMISSION_FORMAT', 'submission.errors.format')

    if (command.action === 'accept') {
      const amendmentId = command.amendmentId ?? submission.egcs_fc_amendment
      if (!amendmentId) return await conflict(event, 'SUBMISSION_AMENDMENT_REQUIRED', 'submission.errors.amendment_required')
      await authorizeFreshAgreementUpdate(event, trx, current, auth, { entityType: 'fundingcaseamendment', entityId: amendmentId })
      if (!command.expectedBudgetConfirmation) {
        return await conflict(event, 'SUBMISSION_BUDGET_REVISION', 'submission.blocker.SUBMISSION_BUDGET_REVISION')
      }
      const row = await surfaceTargetError(event, () => materializeAmendment(event, trx, submission, { agencyId: current.agencyId, streamId: current.streamId }, {
        payload: command.payload ?? submission.egcs_fc_payload,
        amendmentId,
        expectedBudgetRevision: command.expectedBudgetRevision ?? null,
        expectedBudgetConfirmation: command.expectedBudgetConfirmation,
        actorUserId: auth.userId,
        actor
      }))
      return await detail(trx, row, true)
    }

    const row = await trx.updateTable('Funding_Case_Agreement_Submission').set({
      egcs_fc_state: command.action === 'return' ? 'returned' : 'reviewing',
      egcs_fc_mode: 'review',
      egcs_fc_payload: command.action === 'start' ? submission.egcs_fc_payload : (command.payload ?? submission.egcs_fc_payload),
      egcs_fc_updatedby: actor,
      egcs_fc_updatedat: new Date(),
      egcs_fc_revision: submission.egcs_fc_revision + 1
    }).where('id', '=', submissionId).returningAll().executeTakeFirstOrThrow()
    if (command.action === 'start') await appendEvent(trx, row, 'review_started')
    if (command.action === 'return') await appendEvent(trx, row, 'returned', command.description)
    return await detail(trx, row, true)
  }, { ...(command.action === 'accept' ? {} : evidenceOnly), assignmentTarget })
}

export const listAgreementSubmissionAmendments = async (event: H3Event, agreementId: string, submissionId: string) =>
  await readAccess(event, agreementId, async (db, auth, canReview) => {
    if (!canReview) return await forbidden(event)
    const row = await readSubmission(event, db, agreementId, submissionId)
    if (row.egcs_fc_target !== 'amendment_budget') return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
    const candidates = await db.selectFrom('Funding_Case_Agreement_Amendment as amendment')
      .innerJoin('Common_Status as status', 'status.id', 'amendment.egcs_fc_status')
      .innerJoin('Funding_Case_Agreement_Budget_Version as budget', 'budget.egcs_fc_amendment', 'amendment.id')
      .select(['amendment.id', 'amendment.egcs_fc_name_en as nameEn', 'amendment.egcs_fc_name_fr as nameFr'])
      .where('amendment.egcs_fc_fundingagreement', '=', agreementId)
      .where('amendment.egcs_fc_isopen', '=', true).where('amendment._deleted', '=', false)
      .where('status.egcs_cn_isdraft', '=', true).where('status.egcs_cn_readonly', '=', false)
      .where('status.egcs_cn_terminal', '=', false).where('status._deleted', '=', false)
      .where('budget.egcs_fc_iscurrent', '=', false).where('budget._deleted', '=', false)
      .where(eb => eb.exists(eb.selectFrom('Funding_Case_Agreement_Amendment_Type as type')
        .innerJoin('Transfer_Payment_Amendment_Type as allowed', 'allowed.id', 'type.egcs_fc_amendmenttype')
        .select('type.id').whereRef('type.egcs_fc_amendment', '=', 'amendment.id')
        .where('type._deleted', '=', false).where('allowed._deleted', '=', false).where('allowed.egcs_tp_amended', '=', 'budget')))
      .where(eb => eb.not(eb.exists(eb.selectFrom('Common_Completion as completion').select('completion.id')
        .where('completion.egcs_cn_entitytype', '=', 'fundingcaseamendment')
        .whereRef('completion.egcs_cn_entityid', '=', 'amendment.id').where('completion._deleted', '=', false))))
      .execute()
    const options = await Promise.all(candidates.map(async candidate => {
      const grant = await resolveAssignedItemTargetGrant(auth.userId, {
        entityType: 'fundingcaseamendment', entityId: candidate.id
      }, db)
      return grant?.actions.has('update') ? candidate : null
    }))
    return { options: options.filter(option => option !== null) }
  })

export const previewSubmissionBudget = async (
  event: H3Event, agreementId: string, submissionId: string, input: AgreementSubmissionBudgetPreviewInput
): Promise<AgreementSubmissionBudgetPreview> => await readAccess(event, agreementId, async (db, auth, canReview) => {
  if (!canReview) return await forbidden(event)
  const row = await readSubmission(event, db, agreementId, submissionId)
  if (row.egcs_fc_target !== 'amendment_budget' || row.egcs_fc_state !== 'reviewing') {
    return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
  }
  if (row.egcs_fc_formatversion !== 1) return await conflict(event, 'SUBMISSION_FORMAT', 'submission.errors.format')
  const context = await authorizeAgreementResource(event, 'update', agreementId, db, {
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: input.amendmentId },
    freshAuth: true,
    freshAuthContext: auth
  })
  if (!context) return await missingAgreement(event)
  return await surfaceTargetError(event, () => previewAgreementSubmissionBudget(db, {
    event, agreementId, streamId: context.streamId, ...input,
    budgetReview: { submissionId, revision: row.egcs_fc_revision, actorUserId: auth.userId }
  }))
})

const agencyManager = async (
  event: H3Event,
  agencyId: string,
  auth?: AuthContext
) => {
  const scope = { type: 'agency', agencyId } as const
  if (auth) return await authorizeWithFreshAuthContext(event, auth, 'agency', 'delete', scope)
  return await authorize(event, 'agency', 'delete', scope)
}

export const getAutomaticSubmissionBudgetRevision = async (event: H3Event, agreementId: string, amendmentId: string) =>
  await executeFreshReadSnapshot(event, async db => {
    const owner = await resolveAgreementScopeContext(agreementId, db)
    if (!owner) return await missingAgreement(event)
    await agencyManager(event, owner.agencyId)
    if ((await readSubmissionPolicy(db, owner.streamId)).amendment_budget !== 'automatic') {
      return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
    }
    if (await hasActiveAgreementCloseoutWorkflow(db, agreementId)) {
      return await conflict(event, 'AGREEMENT_CLOSEOUT_LOCKED', 'apiErrors.agreement.closeout_locked')
    }
    return await surfaceTargetError(event, () => readAgreementSubmissionBudgetRevision(db, { event, agreementId, amendmentId }))
  }, { authorization: 'snapshot' })

export const receiveAgreementSubmission = async (
  event: H3Event, agreementId: string, input: AgreementSubmissionReceipt
) => {
  const db = event.context.$db
  await requireAuthContext(event)
  const initial = await resolveAgreementScopeContext(agreementId, db)
  if (!initial) return await missingAgreement(event)
  await agencyManager(event, initial.agencyId)

  const authorizeCurrentAgency = async (
    _trx: Transaction<Database>, current: typeof initial, auth: AuthContext
  ) => {
    if (current.agencyId !== initial.agencyId) return await forbidden(event)
    await agencyManager(event, current.agencyId, auth)
  }
  const authOptions = { authorize: authorizeCurrentAgency }
  const received = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initial, async (trx, owner) => {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Submission').selectAll()
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_sourcesystem', '=', input.sourceSystem).where('egcs_fc_sourceid', '=', input.sourceId)
      .forUpdate().executeTakeFirst()

    if (existing) {
      if (existing._deleted || existing.egcs_fc_target !== input.target) {
        return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
      }
      const oldReceipt = await trx.selectFrom('Funding_Case_Agreement_Submission_Event')
        .select(['egcs_fc_formatversion', 'egcs_fc_amendment', 'egcs_fc_budgetrevision'])
        .select(sql<boolean>`egcs_fc_payload = ${JSON.stringify(input.payload)}::jsonb`.as('samePayload'))
        .where('egcs_fc_submission', '=', existing.id).where('egcs_fc_kind', '=', 'received')
        .where('egcs_fc_sourcerevision', '=', input.sourceRevision).executeTakeFirst()
      if (oldReceipt) {
        if (!oldReceipt.samePayload || oldReceipt.egcs_fc_formatversion !== input.formatVersion
          || oldReceipt.egcs_fc_amendment !== (input.amendmentId ?? null)
          || oldReceipt.egcs_fc_budgetrevision !== (input.expectedBudgetRevision ?? null)) {
          return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
        }
        return existing
      }
      if (existing.egcs_fc_state !== 'returned') return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
    }

    const amendmentId = input.amendmentId
      ? (await trx.selectFrom('Funding_Case_Agreement_Amendment').select('id')
          .where('id', '=', input.amendmentId).where('egcs_fc_fundingagreement', '=', agreementId)
          .where('_deleted', '=', false).executeTakeFirst())?.id ?? null
      : null
    const policy = await readSubmissionPolicy(trx, owner.streamId)
    let resultId: string | null = null
    const targetKind = input.target
    if (targetKind !== 'amendment_budget') {
      if (input.formatVersion !== 1) return await conflict(event, 'SUBMISSION_FORMAT', 'submission.errors.format')
      const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_status')
        .where('id', '=', agreementId).executeTakeFirstOrThrow()
      await assertAgreementCloseoutWriteAllowed(event, trx, agreementId, agreement.egcs_fc_status)
      await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseagreement', agreementId)
      resultId = await surfaceTargetError(event, async () => {
        if (existing?.egcs_fc_result) {
          const previousReceipt = await trx.selectFrom('Funding_Case_Agreement_Submission_Event')
            .select(['egcs_fc_formatversion', 'egcs_fc_payload'])
            .where('egcs_fc_submission', '=', existing.id).where('egcs_fc_kind', '=', 'received')
            .where('egcs_fc_sourcerevision', '=', existing.egcs_fc_sourcerevision)
            .where('_deleted', '=', false).executeTakeFirst()
          if (previousReceipt?.egcs_fc_formatversion !== 1
            || existing.egcs_fc_formatversion !== previousReceipt.egcs_fc_formatversion
            || !previousReceipt.egcs_fc_payload
            || !agreementSubmissionTargetSchemas[targetKind].safeParse(previousReceipt.egcs_fc_payload).success) {
            return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
          }
          const revision = {
            event, agreementId, target: targetKind, targetId: existing.egcs_fc_result,
            payload: input.payload, previousSourcePayload: previousReceipt.egcs_fc_payload
          }
          await applyLinkedSubmissionRevision(trx, revision)
          return existing.egcs_fc_result
        }
        const primaryUserId = await currentPrimary(trx, agreementId)
        if (!primaryUserId) return await conflict(event, 'SUBMISSION_PRIMARY_REQUIRED', 'submission.errors.primary_required')
        const target = await applyAgreementSubmissionTarget(trx, {
          event,
          agreementId,
          agencyId: owner.agencyId,
          streamId: owner.streamId,
          target: targetKind,
          payload: input.payload,
          amendmentId: null,
          expectedBudgetRevision: null,
          primaryUserId,
          actorUserId: null
        })
        return target.id
      })
    }
    const updates = {
      egcs_fc_sourcerevision: input.sourceRevision,
      egcs_fc_formatversion: input.formatVersion,
      egcs_fc_state: 'submitted' as const,
      egcs_fc_mode: existing?.egcs_fc_mode ?? policy[input.target] ?? 'review',
      egcs_fc_revision: existing ? existing.egcs_fc_revision + 1 : 1,
      egcs_fc_payload: input.payload,
      egcs_fc_amendment: amendmentId,
      egcs_fc_budgetrevision: input.expectedBudgetRevision ?? null,
      egcs_fc_blocker: null,
      egcs_fc_result: resultId,
      egcs_fc_updatedby: null,
      egcs_fc_updatedat: new Date()
    }
    const row = existing
      ? await trx.updateTable('Funding_Case_Agreement_Submission').set(updates)
          .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
      : await trx.insertInto('Funding_Case_Agreement_Submission').values({
          ...updates,
          egcs_fc_fundingagreement: agreementId,
          egcs_fc_target: input.target,
          egcs_fc_sourcesystem: input.sourceSystem,
          egcs_fc_sourceid: input.sourceId
        }).returningAll().executeTakeFirstOrThrow()
    await appendEvent(trx, { ...row, egcs_fc_amendment: input.amendmentId ?? null }, 'received')
    return row
  }, { ...evidenceOnly, ...authOptions })

  const automaticPending = (row: Submission) =>
    row.egcs_fc_target === 'amendment_budget' && row.egcs_fc_state === 'submitted' && row.egcs_fc_mode === 'automatic' && row.egcs_fc_blocker == null
    && row.egcs_fc_sourcerevision === input.sourceRevision
  if (!automaticPending(received)) return submissionDto(received)
  try {
    const result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initial, async (trx, current) => {
      const row = await readSubmission(event, trx, agreementId, received.id, true)
      if (!automaticPending(row)) return row
      return await materializeAmendment(event, trx, row, { agencyId: current.agencyId, streamId: current.streamId }, {
        payload: row.egcs_fc_payload,
        amendmentId: row.egcs_fc_amendment,
        expectedBudgetRevision: row.egcs_fc_budgetrevision,
        actorUserId: null,
        actor: null
      })
    }, authOptions)
    return submissionDto(result)
  } catch (error: unknown) {
    if (isError(error) && [401, 403].includes(error.statusCode)) throw error
    const blocker = expectedTargetError(error)
    if (!blocker) {
      console.error({
        event: 'agreement.submission_automatic_failed',
        agreementId,
        submissionId: received.id,
        errorName: error instanceof Error ? error.name : 'Unknown'
      })
      throw error
    }
    const result = await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initial, async trx => {
      const row = await readSubmission(event, trx, agreementId, received.id, true)
      if (!automaticPending(row)) return row
      return await trx.updateTable('Funding_Case_Agreement_Submission')
        .set({ egcs_fc_blocker: blocker, egcs_fc_updatedat: new Date(), egcs_fc_revision: row.egcs_fc_revision + 1 })
        .where('id', '=', row.id).returningAll().executeTakeFirstOrThrow()
    }, { ...evidenceOnly, ...authOptions })
    return submissionDto(result)
  }
}
