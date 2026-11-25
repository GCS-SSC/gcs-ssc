/* eslint-disable jsdoc/require-jsdoc -- Agreement Submission command boundary. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Selectable, type Transaction, type Updateable } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type {
  AgreementSubmissionTable,
  ClaimSubmissionReferenceSnapshot
} from '~~/shared/types/agreement-submission-database'
import type {
  AgreementSubmissionCommand,
  AgreementSubmissionList,
  AgreementSubmissionListQuery,
  AgreementSubmissionReceipt
} from '~~/shared/types/agreement-submission'
import type { ClaimCustomFieldSnapshot } from '~~/shared/types/schemas/agreement-custom-fields'
import { agreementSubmissionTargetSchemas } from '~~/shared/types/schemas/agreement-submission-targets'
import {
  agreementSubmissionReviewTransitions,
  resolveAgreementSubmissionReceiptTransition,
  type AgreementSubmissionTransition
} from '~~/shared/utils/agreement-submission-transitions'
import { claimCustomFieldSnapshot } from '~~/shared/utils/claim-custom-field-snapshot'
import { readClaimSubmissionEvidence } from './agreement-submission-claim-evidence'
import { assertClaimCustomFieldsComplete, parsePersistedClaimCustomFieldDefinitions } from './agreement-claim-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource, canAccessAgreement, resolveAgreementScopeContext, type AgreementScopeContext } from './agreement'
import {
  assertAgreementCloseoutWriteAllowed,
  executeFreshAuthorizedAgreementWrite
} from './agreement-write-transaction'
import { authorize, authorizeWithFreshAuthContext, requireAuthContext, type AuthContext } from './authorize'
import { badRequest, forbidden, notFound, throwApiError } from './api-errors'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { resolveAssignmentCommonUserId } from './entity-assignment'
import {
  applyAgreementSubmissionTarget,
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
  return targetId ? { target, targetId } : null
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
  egcs_fc_resultforecast: _resultForecast,
  egcs_fc_resultclaim: _resultClaim,
  ...row
}: Submission) => ({
  ...row,
  egcs_fc_updatedat: new Date(row.egcs_fc_updatedat).toISOString()
})

const detail = async (db: SubmissionDb, submission: Submission, canReview: boolean, returnAllowed = true) => {
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
    canReturn: canReview && returnAllowed,
    returnAllowed
  }
}

const appendEvent = async (
  trx: Transaction<Database>,
  submission: Submission,
  kind: NonNullable<AgreementSubmissionTransition['event']>,
  description: string | null = null
) => {
  const capturesSnapshot = kind === 'received' || kind === 'returned' || kind === 'accepted'
  const evidence = capturesSnapshot && submission.egcs_fc_target === 'claim' && submission.egcs_fc_result
    ? await readClaimSubmissionEvidence(
        trx,
        submission.egcs_fc_result,
        parsePersistedClaimCustomFieldDefinitions,
        kind === 'received' ? agreementSubmissionTargetSchemas.claim.parse(submission.egcs_fc_payload) : undefined
      )
    : null
  let forecastFields: ClaimCustomFieldSnapshot = []
  if (capturesSnapshot && submission.egcs_fc_target === 'forecast' && submission.egcs_fc_result) {
    const forecast = await trx.selectFrom('Funding_Case_Agreement_Forecast')
      .select(['egcs_fc_customfielddefinitions', 'egcs_fc_customfields'])
      .where('id', '=', submission.egcs_fc_result).where('_deleted', '=', false).executeTakeFirstOrThrow()
    forecastFields = claimCustomFieldSnapshot(
      await parsePersistedClaimCustomFieldDefinitions(forecast.egcs_fc_customfielddefinitions, undefined, 'forecast'),
      forecast.egcs_fc_customfields
    )
  }
  await trx.insertInto('Funding_Case_Agreement_Submission_Event').values({
    egcs_fc_forecastcustomfields: forecastFields.length ? sql<ClaimCustomFieldSnapshot>`${JSON.stringify(forecastFields)}::jsonb` : null,
    egcs_fc_claimcustomfields: evidence?.fields.length ? sql<ClaimCustomFieldSnapshot>`${JSON.stringify(evidence.fields)}::jsonb` : null,
    egcs_fc_claimreferences: evidence ? sql<ClaimSubmissionReferenceSnapshot>`${JSON.stringify(evidence.references)}::jsonb` : null,
    egcs_fc_submission: submission.id,
    egcs_fc_kind: kind,
    egcs_fc_sourcerevision: submission.egcs_fc_sourcerevision,
    egcs_fc_formatversion: submission.egcs_fc_formatversion,
    egcs_fc_payload: capturesSnapshot ? submission.egcs_fc_payload : null,
    egcs_fc_description: description,
    egcs_fc_actor: submission.egcs_fc_updatedby
  }).execute()
}

const nextSubmissionRevision = (submission: Submission | undefined) => ({
  egcs_fc_revision: (submission?.egcs_fc_revision ?? 0) + 1,
  egcs_fc_updatedat: new Date()
})

// The caller admits the transition while holding the Agreement and Submission locks.
const persistSubmissionTransition = async (
  trx: Transaction<Database>,
  submission: Submission,
  transition: AgreementSubmissionTransition,
  changes: Updateable<Pick<AgreementSubmissionTable,
    'egcs_fc_payload' | 'egcs_fc_updatedby'
  >>,
  description?: string
) => {
  const row = await trx.updateTable('Funding_Case_Agreement_Submission').set({
    ...changes,
    egcs_fc_state: transition.state,
    ...nextSubmissionRevision(submission)
  }).where('id', '=', submission.id).returningAll().executeTakeFirstOrThrow()
  if (transition.event) await appendEvent(trx, row, transition.event, description)
  return row
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
    return await detail(db, row, allowed, await allowsReturn(db, context.streamId, linked.target))
  })

export const commandAgreementSubmission = async (
  event: H3Event, agreementId: string, submissionId: string, command: AgreementSubmissionCommand
) => {
  const db = event.context.$db
  if (!await authorizeAgreementResource(event, 'read', agreementId, db)) return await missingAgreement(event)
  const preliminary = await readSubmission(event, db, agreementId, submissionId)
  const linked = financialTarget(preliminary)
  if (!linked) return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
  const assignmentTarget = targetAssignment(linked.target, linked.targetId)
  const initial = await authorizeAgreementResource(event, 'update', agreementId, db, { assignmentTarget })
  if (!initial) return await missingAgreement(event)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initial, async (trx, current, auth) => {
    const submission = await readSubmission(event, trx, agreementId, submissionId, true)
    if (submission.egcs_fc_revision !== command.revision) return await conflict(event, 'SUBMISSION_STALE', 'submission.errors.stale')
    const transition = agreementSubmissionReviewTransitions[command.action]
    if (command.action !== 'withdraw_return' && submission.egcs_fc_state !== transition.from) {
      return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
    }
    const actor = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actor) return await forbidden(event)

    if (command.action === 'withdraw_return') {
      if (submission.egcs_fc_state !== transition.from) {
        return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')
      }
      const receipt = await trx.selectFrom('Funding_Case_Agreement_Submission_Event')
        .select('egcs_fc_payload').where('egcs_fc_submission', '=', submissionId)
        .where('egcs_fc_kind', '=', 'received').where('egcs_fc_sourcerevision', '=', submission.egcs_fc_sourcerevision)
        .where('_deleted', '=', false).executeTakeFirst()
      if (!receipt?.egcs_fc_payload) {
        return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
      }
      const row = await persistSubmissionTransition(trx, submission, transition, {
        egcs_fc_payload: receipt.egcs_fc_payload,
        egcs_fc_updatedby: actor
      })
      return await detail(trx, row, true, await allowsReturn(trx, current.streamId, linked.target))
    }

    if (command.action === 'save' || ('payload' in command && command.payload !== undefined)) {
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
    if (action === 'accept') await assertClaimCustomFieldsComplete(event, trx, linked.targetId, linked.target)
    const row = await persistSubmissionTransition(trx, submission, transition, {
      egcs_fc_payload: snapshot,
      egcs_fc_updatedby: actor
    }, action === 'return' ? command.description : undefined)
    return await detail(trx, row, true, canReturn)
  }, { ...(command.action === 'accept' ? {} : evidenceOnly), assignmentTarget })
}

const agencyManager = async (
  event: H3Event,
  agencyId: string,
  auth?: AuthContext
) => {
  const scope = { type: 'agency', agencyId } as const
  if (auth) return await authorizeWithFreshAuthContext(event, auth, 'agency', 'delete', scope)
  return await authorize(event, 'agency', 'delete', scope)
}

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
        .select('egcs_fc_formatversion')
        .select(sql<boolean>`egcs_fc_payload = ${JSON.stringify(input.payload)}::jsonb`.as('samePayload'))
        .where('egcs_fc_submission', '=', existing.id).where('egcs_fc_kind', '=', 'received')
        .where('egcs_fc_sourcerevision', '=', input.sourceRevision).executeTakeFirst()
      if (oldReceipt) {
        if (!oldReceipt.samePayload || oldReceipt.egcs_fc_formatversion !== input.formatVersion) {
          return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
        }
        return existing
      }
    }
    const transition = resolveAgreementSubmissionReceiptTransition(existing?.egcs_fc_state ?? null)
    if (!transition) return await conflict(event, 'SUBMISSION_STATE', 'submission.errors.state')

    if (input.formatVersion !== 1) return await conflict(event, 'SUBMISSION_FORMAT', 'submission.errors.format')
    const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_status')
      .where('id', '=', agreementId).executeTakeFirstOrThrow()
    await assertAgreementCloseoutWriteAllowed(event, trx, agreementId, agreement.egcs_fc_status)
    await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseagreement', agreementId)
    const resultId = await surfaceTargetError(event, async () => {
      if (existing?.egcs_fc_result) {
        const previousReceipt = await trx.selectFrom('Funding_Case_Agreement_Submission_Event')
          .select(['egcs_fc_formatversion', 'egcs_fc_payload'])
          .where('egcs_fc_submission', '=', existing.id).where('egcs_fc_kind', '=', 'received')
          .where('egcs_fc_sourcerevision', '=', existing.egcs_fc_sourcerevision)
          .where('_deleted', '=', false).executeTakeFirst()
        if (previousReceipt?.egcs_fc_formatversion !== 1
          || existing.egcs_fc_formatversion !== previousReceipt.egcs_fc_formatversion
          || !previousReceipt.egcs_fc_payload
          || !agreementSubmissionTargetSchemas[input.target].safeParse(previousReceipt.egcs_fc_payload).success) {
          return await conflict(event, 'SUBMISSION_SOURCE_CONFLICT', 'submission.errors.source_conflict')
        }
        const revision = {
          event, agreementId, target: input.target, targetId: existing.egcs_fc_result,
          payload: input.payload, previousSourcePayload: previousReceipt.egcs_fc_payload,
          returnedPayload: existing.egcs_fc_payload
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
        target: input.target,
        payload: input.payload,
        primaryUserId
      })
      return target.id
    })
    const policy = await readSubmissionPolicy(trx, owner.streamId)
    const updates = {
      egcs_fc_mode: existing?.egcs_fc_mode ?? policy[input.target] ?? 'review',
      egcs_fc_sourcerevision: input.sourceRevision,
      egcs_fc_formatversion: input.formatVersion,
      egcs_fc_state: transition.state,
      ...nextSubmissionRevision(existing),
      egcs_fc_payload: input.payload,
      egcs_fc_result: resultId,
      egcs_fc_updatedby: null
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
    await appendEvent(trx, row, transition.event)
    return row
  }, { ...evidenceOnly, ...authOptions })

  return submissionDto(received)
}
