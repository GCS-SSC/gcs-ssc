import { mergeAgreementCustomFields } from './agreement-custom-fields'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while agreement profile helpers receive complete documentation. */
import { readBody, type H3Event } from 'h3'
import type { Kysely } from 'kysely'
import { badRequest, forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { parseI18n } from '~~/server/utils/api-validate'
import {
  authorizeFreshAssignedItem,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import type { AuthContext } from '~~/server/utils/authorize'
import {
  canAccessAgreementStream,
  isAgreementHoldbackBasisValid,
  mapAgreementWriteValues,
  resolveAgreementRiskRatingContext,
  resolveAgreementStreamScopeContext,
  resolveAgreementSubtypeContext,
  resolveAgreementScopeContext,
  type AgreementScopeContext
} from '~~/server/utils/agreement'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import {
  lockRegisteredExtensionAgreementLifecycle,
  lockRegisteredExtensionAgreementScopes,
  runExtensionAgreementStreamChangeGuards
} from '~~/server/utils/extensions'
import { FundingCaseAgreementProfilePatchSchema } from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'
import type { StatusId } from '~~/shared/types/status'
import type { FundingCaseAgreementProfileItem, FundingCaseAgreementProfilePatch } from '~~/shared/types/schemas'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import { assertAgreementApprovalSubmissionUnlocked } from '~~/server/utils/agreement-approval-submission'
import { assertAgreementCloseoutWriteAllowed } from '~~/server/utils/agreement-write-transaction'
import { assertAgreementBudgetFiscalYearsOverlapDuration } from '~~/server/utils/agreement-fiscal-year-duration'
import { BusinessStatusViolation, lockBusinessStatus } from '~~/server/utils/business-status-runtime'
import { isAgreementRiskRatingWorkflowManaged } from '~~/server/utils/agreement-risk-rating'
import {
  collectFundingHistorySimilarityWarnings,
  requireFundingHistorySimilarityConfirmation
} from '~~/server/utils/funding-history'

const readAgreementProfilePatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readBody?: typeof readBody
  }).readBody ?? readBody
  const rawBody = await bodyReader<Record<string, unknown>>(event) as Record<string, unknown>
  const validated = await parseI18n(event, FundingCaseAgreementProfilePatchSchema, rawBody)

  return { rawBody, validated }
}

const resolveCurrentAgreementSubtypeId = async (
  db: Kysely<Database>,
  agreementId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Profile')
  .where('id', '=', agreementId)
  .where('_deleted', '=', false)
  .select('egcs_fc_agreementsubtype')
  .executeTakeFirst()
  .then(row => row ? String(row.egcs_fc_agreementsubtype) : '')

const resolveCurrentAgreementRiskScore = async (
  db: Kysely<Database>,
  agreementId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Profile')
  .where('id', '=', agreementId)
  .where('_deleted', '=', false)
  .select('egcs_fc_riskscore')
  .executeTakeFirst()
  .then(row => row?.egcs_fc_riskscore)

const resolveNextAgreementStreamId = (
  validated: FundingCaseAgreementProfilePatch,
  existingContext: AgreementScopeContext
) => Object.hasOwn(validated, 'egcs_fc_transferpaymentstream')
  ? String(validated.egcs_fc_transferpaymentstream)
  : existingContext.streamId

/** Locks the agreement row so scope, defaults, authorization, and profile writes share one serialization point. */
const lockAgreementProfile = async (
  db: Kysely<Database>,
  agreementId: string
): Promise<{ id: string, status: StatusId } | null> => {
  const agreement = await db
    .selectFrom('Funding_Case_Agreement_Profile')
    .where('id', '=', agreementId)
    .where('_deleted', '=', false)
    .select(['id', 'egcs_fc_status'])
    .forUpdate()
    .executeTakeFirst()
  return agreement ? { id: String(agreement.id), status: agreement.egcs_fc_status } : null
}

class AgreementProfileScopeChanged extends Error {
  constructor(readonly context: AgreementScopeContext) {
    super('Agreement profile scope changed while acquiring lifecycle locks.')
  }
}

const AGREEMENT_SCOPE_LOCK_MAX_ATTEMPTS = 3

const agreementScopeMatches = (
  expected: AgreementScopeContext,
  current: AgreementScopeContext
): boolean => expected.agencyId === current.agencyId
  && expected.profileId === current.profileId
  && expected.streamId === current.streamId

/** Ensures a replacement stream belongs to the agreement's transfer payment program. */
const validateAgreementProfileStream = async (
  event: H3Event,
  db: Kysely<Database>,
  context: AuthContext,
  existingContext: AgreementScopeContext,
  nextStreamId: string
) => {
  const nextStreamContext = await resolveAgreementStreamScopeContext(nextStreamId, db, {
    requireAvailable: nextStreamId !== existingContext.streamId
  })
  if (!nextStreamContext) {
    return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  }

  if (nextStreamContext.profileId !== existingContext.profileId) {
    return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  }

  if (nextStreamId !== existingContext.streamId) {
    const canMove = await canAccessAgreementStream(context, 'update', nextStreamContext.scope, db)
    if (!canMove) {
      return await forbidden(event)
    }
  }

  return null
}

/** Ensures a replacement subtype belongs to the agreement's agency. */
const validateAgreementProfileSubtype = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  nextStreamId: string,
  validated: FundingCaseAgreementProfilePatch
) => {
  const nextSubtypeId = Object.hasOwn(validated, 'egcs_fc_agreementsubtype')
    ? String(validated.egcs_fc_agreementsubtype)
    : await resolveCurrentAgreementSubtypeId(db, agreementId)

  const subtypeContext = await resolveAgreementSubtypeContext(nextSubtypeId, nextStreamId, db)
  if (subtypeContext) {
    return subtypeContext
  }

  const subtypeExists = await db
    .selectFrom('Transfer_Payment_Agreement_Subtype')
    .where('id', '=', nextSubtypeId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!subtypeExists) {
    return await badRequest(event, 'INVALID_AGREEMENT_SUBTYPE', 'apiErrors.agreement.invalid_subtype')
  }

  return await badRequest(event, 'INVALID_AGREEMENT_SUBTYPE_STREAM', 'apiErrors.agreement.subtype_stream_mismatch')
}

/** Ensures a replacement risk score belongs to the agreement's assessment context. */
const validateAgreementProfileRiskScore = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  nextStreamId: string,
  validated: FundingCaseAgreementProfilePatch
) => {
  const nextRiskScore = Object.hasOwn(validated, 'egcs_fc_riskscore')
    ? validated.egcs_fc_riskscore
    : await resolveCurrentAgreementRiskScore(db, agreementId)

  if (nextRiskScore === undefined || nextRiskScore === null) {
    return null
  }

  const riskRatingContext = await resolveAgreementRiskRatingContext(nextRiskScore, nextStreamId, db)
  if (!riskRatingContext) {
    return await badRequest(event, 'INVALID_AGREEMENT_RISK_SCORE', 'apiErrors.agreement.invalid_risk_score')
  }

  return null
}

const validateAgreementProfileHoldbackBasis = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  nextStreamId: string,
  validated: FundingCaseAgreementProfilePatch
) => {
  const basisId = Object.hasOwn(validated, 'egcs_fc_holdbackbasis')
    ? String(validated.egcs_fc_holdbackbasis)
    : await db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_holdbackbasis')
        .where('id', '=', agreementId).executeTakeFirst().then(row => String(row?.egcs_fc_holdbackbasis))
  return await isAgreementHoldbackBasisValid(basisId, nextStreamId, db)
    ? null
    : await badRequest(event, 'INVALID_AGREEMENT_HOLDBACK_BASIS', 'apiErrors.agreement.invalid_holdback_basis')
}

const emitAgreementProfileUpdated = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  streamId: string,
  rawBody: Record<string, unknown>,
  validatedBody: FundingCaseAgreementProfilePatch,
  updatedAgreement: FundingCaseAgreementProfileItem
) => {
  await useNitroApp().hooks.callHook('agreement:profile:updated', {
    event,
    db,
    agreementId,
    streamId,
    rawBody,
    validatedBody,
    updatedAgreement
  })
}

/** Applies subtype and risk validation before persisting an already stream-validated patch. */
const patchValidatedAgreementProfile = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  nextStreamId: string,
  rawBody: Record<string, unknown>,
  validated: FundingCaseAgreementProfilePatch
) => {
  const subtypeContext = await validateAgreementProfileSubtype(event, db, agreementId, nextStreamId, validated)
  if (!('agreementType' in subtypeContext)) {
    return subtypeContext
  }

  const current = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select(['egcs_fc_transferpaymentstream', 'egcs_fc_riskscore'])
    .where('id', '=', agreementId).executeTakeFirstOrThrow()
  const streamChanged = String(current.egcs_fc_transferpaymentstream) !== nextStreamId
  const includesRiskScore = Object.hasOwn(validated, 'egcs_fc_riskscore')
  const echoesCurrentRiskScore = validated.egcs_fc_riskscore === current.egcs_fc_riskscore
    || (current.egcs_fc_riskscore !== null && current.egcs_fc_riskscore !== undefined
      && validated.egcs_fc_riskscore !== null && validated.egcs_fc_riskscore !== undefined
      && Number(validated.egcs_fc_riskscore) === Number(current.egcs_fc_riskscore))
  const riskWorkflowManaged = streamChanged || (includesRiskScore && !echoesCurrentRiskScore)
    ? await isAgreementRiskRatingWorkflowManaged(db, nextStreamId)
    : false
  if (!streamChanged && riskWorkflowManaged && includesRiskScore
    && !echoesCurrentRiskScore) {
    return await badRequest(event, 'AGREEMENT_RISK_SCORE_WORKFLOW_MANAGED', 'apiErrors.agreement.risk_score_workflow_managed')
  }
  const sanitized = { ...validated }
  if (riskWorkflowManaged) delete sanitized.egcs_fc_riskscore
  if (streamChanged) sanitized.egcs_fc_riskscore = null
  const riskScoreError = await validateAgreementProfileRiskScore(event, db, agreementId, nextStreamId, sanitized)
  if (riskScoreError) {
    return riskScoreError
  }

  const holdbackBasisError = await validateAgreementProfileHoldbackBasis(event, db, agreementId, nextStreamId, validated)
  if (holdbackBasisError) return holdbackBasisError

  const values = mapAgreementWriteValues(sanitized, subtypeContext.agreementType)
  const stored = await db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_customfields').where('id', '=', agreementId).executeTakeFirstOrThrow()
  values.egcs_fc_customfields = await mergeAgreementCustomFields(
    event, db, nextStreamId, stored.egcs_fc_customfields, validated.egcs_fc_customfields ?? {}
  )

  try {
    if (Object.keys(values).length === 1 && Object.hasOwn(values, 'egcs_fc_agreementtype')) {
      const updatedAgreement = await db
        .selectFrom('Funding_Case_Agreement_Profile')
        .where('id', '=', agreementId)
        .where('_deleted', '=', false)
        .selectAll()
        .executeTakeFirstOrThrow()

      await emitAgreementProfileUpdated(event, db, agreementId, nextStreamId, rawBody, validated, updatedAgreement)
      return updatedAgreement
    }

    const updatedAgreement = await db
      .updateTable('Funding_Case_Agreement_Profile')
      .set(values)
      .where('id', '=', agreementId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()

    await emitAgreementProfileUpdated(event, db, agreementId, nextStreamId, rawBody, validated, updatedAgreement)
    return updatedAgreement
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

/** Validates cross-entity references before patching agreement profile fields. */
export const patchAgreementProfile = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext
) => {
  const { rawBody, validated } = await readAgreementProfilePatchBody(event)
  let lockContext = initialContext
  let lockAttempt = 0

  while (lockAttempt < AGREEMENT_SCOPE_LOCK_MAX_ATTEMPTS) {
    lockAttempt += 1
    try {
      return await db.transaction().execute(async trx => {
        const authContext = await requireFreshAuthContext(event, trx)
        const targetStreamIds = [lockContext.streamId]
        await lockRegisteredExtensionAgreementScopes(
          trx,
          lockContext.agencyId,
          targetStreamIds
        )
        await lockTransferPaymentStreams(trx, targetStreamIds)
        await lockRegisteredExtensionAgreementLifecycle(event, trx, {
          agreementId,
          agencyId: lockContext.agencyId,
          currentStreamId: lockContext.streamId,
          targetStreamIds
        })

        const lockedAgreement = await lockAgreementProfile(trx, agreementId)
        if (!lockedAgreement) {
          return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
        }
        await assertAgreementCloseoutWriteAllowed(event, trx, agreementId, lockedAgreement.status)
        try {
          await lockBusinessStatus(trx, 'fundingcaseagreement', agreementId, 'ordinary')
        } catch (error: unknown) {
          if (!(error instanceof BusinessStatusViolation)) throw error
          return await throwApiError(event, {
            statusCode: 409,
            code: error.code,
            key: 'apiErrors.request.invalid_status'
          })
        }

        const existingContext = await resolveAgreementScopeContext(agreementId, trx)
        if (!existingContext) {
          return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
        }
        if (!agreementScopeMatches(lockContext, existingContext)) {
          throw new AgreementProfileScopeChanged(existingContext)
        }

        await authorizeFreshAssignedItem(
          event,
          trx,
          authContext,
          'fundingcaseagreement',
          agreementId,
          'update'
        )
        await assertAgreementApprovalSubmissionUnlocked(event, trx, agreementId)
        const context = authContext
        const nextStreamId = resolveNextAgreementStreamId(validated, existingContext)

        if (nextStreamId !== existingContext.streamId) {
          return await badRequest(event, 'AGREEMENT_STREAM_IMMUTABLE', 'apiErrors.agreement.stream_immutable')
        }

        const streamError = await validateAgreementProfileStream(
          event,
          trx,
          context,
          existingContext,
          nextStreamId
        )
        if (streamError) {
          return streamError
        }

        if (
          Object.hasOwn(validated, 'egcs_fc_agreementnumber')
          || Object.hasOwn(validated, 'egcs_fc_transferpaymentstream')
        ) {
          const nextStreamContext = await resolveAgreementStreamScopeContext(nextStreamId, trx)
          const currentAgreement = await trx
            .selectFrom('Funding_Case_Agreement_Profile')
            .where('id', '=', agreementId)
            .select('egcs_fc_agreementnumber')
            .executeTakeFirstOrThrow()
          const agreementNumber = typeof validated.egcs_fc_agreementnumber === 'string'
            ? validated.egcs_fc_agreementnumber
            : currentAgreement.egcs_fc_agreementnumber
          const confirmations = Array.isArray(rawBody.confirmations)
            ? rawBody.confirmations.filter((value): value is string => typeof value === 'string')
            : []
          if (nextStreamContext) {
            const similarityWarnings = await collectFundingHistorySimilarityWarnings(context, {
              egcs_ar_agencyname_en: nextStreamContext.agencyNameEn,
              egcs_ar_agencyname_fr: nextStreamContext.agencyNameFr,
              egcs_ar_programname_en: nextStreamContext.programNameEn,
              egcs_ar_programname_fr: nextStreamContext.programNameFr,
              egcs_ar_agreementnumber: agreementNumber
            }, trx, { proposedSource: 'system', excludeAgreementId: agreementId })
            await requireFundingHistorySimilarityConfirmation(event, similarityWarnings, confirmations)
          }
        }

        if (nextStreamId !== existingContext.streamId) {
          await runExtensionAgreementStreamChangeGuards(event, trx, {
            agreementId,
            agencyId: existingContext.agencyId,
            currentStreamId: existingContext.streamId,
            nextStreamId
          })
        }

        if (
          Object.hasOwn(validated, 'egcs_fc_authorizedassistancestartdate')
          || Object.hasOwn(validated, 'egcs_fc_authorizedassistanceenddate')
        ) {
          const currentDuration = await trx.selectFrom('Funding_Case_Agreement_Profile')
            .select(['egcs_fc_authorizedassistancestartdate', 'egcs_fc_authorizedassistanceenddate'])
            .where('id', '=', agreementId).executeTakeFirstOrThrow()
          const durationError = await assertAgreementBudgetFiscalYearsOverlapDuration(event, trx, agreementId, {
            startDate: validated.egcs_fc_authorizedassistancestartdate ?? currentDuration.egcs_fc_authorizedassistancestartdate,
            endDate: validated.egcs_fc_authorizedassistanceenddate ?? currentDuration.egcs_fc_authorizedassistanceenddate
          })
          if (durationError) return durationError
        }

        return await patchValidatedAgreementProfile(
          event,
          trx,
          agreementId,
          nextStreamId,
          rawBody,
          validated
        )
      })
    } catch (error: unknown) {
      if (!(error instanceof AgreementProfileScopeChanged)) {
        throw error
      }
      if (lockAttempt === AGREEMENT_SCOPE_LOCK_MAX_ATTEMPTS) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_SCOPE_CHANGED',
          key: 'apiErrors.agreement.scope_changed'
        })
      }
      lockContext = error.context
    }
  }

  return await throwApiError(event, {
    statusCode: 409,
    code: 'AGREEMENT_SCOPE_CHANGED',
    key: 'apiErrors.agreement.scope_changed'
  })
}
