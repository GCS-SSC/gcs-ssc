import { mergeAgreementCustomFields } from '~~/server/utils/agreement-custom-fields'
import type { Insertable } from 'kysely'
import { FundingCaseAgreementCreateSchema } from '~~/shared/types/schemas'
import {
  authorize,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import {
  canAccessAgreementStream,
  isAgreementHoldbackBasisValid,
  mapAgreementWriteValues,
  resolveAgreementRiskRatingContext,
  resolveAgreementStreamScopeContext,
  resolveAgreementSubtypeContext
} from '~~/server/utils/agreement'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import type {
  FundingCaseAgreementApplicantRecipientTable,
  FundingCaseAgreementProfileTable
} from '~~/shared/types/database'
import { z } from 'zod'
import {
  collectFundingHistorySimilarityWarnings,
  requireFundingHistorySimilarityConfirmation
} from '~~/server/utils/funding-history'
import { lockRegisteredExtensionAgreementScopes } from '~~/server/utils/extensions'
import { lockTransferPaymentStreams } from '~~/server/utils/transfer-payment-stream-lock'
import {
  canAccessApplicantRecipientIds,
  lockActiveApplicantRecipientIds
} from '~~/server/utils/applicant-recipient-auth'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { isAgreementRiskRatingWorkflowManaged } from '~~/server/utils/agreement-risk-rating'

/** Signals that agreement creation must restart with a newly observed agency scope. */
class AgreementCreateScopeChanged extends Error {
  /**
   * Creates a retry signal carrying the current stream scope.
   *
   * @param context - Newly resolved stream scope.
   */
  constructor(readonly context: NonNullable<Awaited<ReturnType<typeof resolveAgreementStreamScopeContext>>>) {
    super('Agreement stream scope changed while acquiring lifecycle locks.')
  }
}

const AGREEMENT_CREATE_SCOPE_LOCK_MAX_ATTEMPTS = 3

export default defineEventHandler(async event => {
  const db = event.context.$db
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementCreateSchema.and(z.object({
    confirmations: z.array(z.string().trim().min(1)).default([])
  })))

  const streamId = String(validated.egcs_fc_transferpaymentstream)
  const streamContext = await resolveAgreementStreamScopeContext(streamId, db, { requireAvailable: true })
  if (!streamContext) {
    return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  }

  await authorize(event, 'agreement', 'create', async ({ context }) => {
    const canCreate = await canAccessAgreementStream(context, 'create', streamContext.scope, db)
    if (canCreate) return { bypass: true }
    return { scope: streamContext.scope }
  })

  try {
    let lockContext = streamContext
    let lockAttempt = 0
    while (lockAttempt < AGREEMENT_CREATE_SCOPE_LOCK_MAX_ATTEMPTS) {
      lockAttempt += 1
      try {
        return await db.transaction().execute(async trx => {
          const authContext = await requireFreshAuthContext(event, trx)
          await lockRegisteredExtensionAgreementScopes(trx, lockContext.agencyId, [streamId])
          const lockedStreams = await lockTransferPaymentStreams(trx, [streamId])
          if (!lockedStreams.has(streamId)) {
            return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
          }
          const currentStreamContext = await resolveAgreementStreamScopeContext(streamId, trx, { requireAvailable: true })
          if (!currentStreamContext) {
            return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
          }
          if (currentStreamContext.agencyId !== lockContext.agencyId) {
            throw new AgreementCreateScopeChanged(currentStreamContext)
          }

          await authorizeWithFreshAuthContext(event, authContext, 'agreement', 'create', async ({ context }) => {
            const canCreate = await canAccessAgreementStream(context, 'create', currentStreamContext.scope, trx)
            if (canCreate) return { bypass: true }
            return { scope: currentStreamContext.scope }
          })

          const similarityWarnings = await collectFundingHistorySimilarityWarnings(authContext, {
            egcs_ar_agencyname_en: currentStreamContext.agencyNameEn,
            egcs_ar_agencyname_fr: currentStreamContext.agencyNameFr,
            egcs_ar_programname_en: currentStreamContext.programNameEn,
            egcs_ar_programname_fr: currentStreamContext.programNameFr,
            egcs_ar_agreementnumber: validated.egcs_fc_agreementnumber
          }, trx, { proposedSource: 'system' })
          await requireFundingHistorySimilarityConfirmation(
            event,
            similarityWarnings,
            validated.confirmations
          )

          const applicantRecipientIds = validated.applicant_recipient_ids.map(String)
          if (!await lockActiveApplicantRecipientIds(trx, applicantRecipientIds)) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }
          if (!await canAccessApplicantRecipientIds(authContext, applicantRecipientIds, 'read', trx)) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }

          const subtypeId = String(validated.egcs_fc_agreementsubtype)
          const subtypeContext = await resolveAgreementSubtypeContext(subtypeId, streamId, trx)
          if (!subtypeContext) {
            const subtypeExists = await trx
              .selectFrom('Transfer_Payment_Agreement_Subtype')
              .where('id', '=', subtypeId)
              .where('_deleted', '=', false)
              .select('id')
              .executeTakeFirst()
            if (!subtypeExists) {
              return await badRequest(event, 'INVALID_AGREEMENT_SUBTYPE', 'apiErrors.agreement.invalid_subtype')
            }
            return await badRequest(event, 'INVALID_AGREEMENT_SUBTYPE_STREAM', 'apiErrors.agreement.subtype_stream_mismatch')
          }

          const riskWorkflowManaged = await isAgreementRiskRatingWorkflowManaged(trx, streamId)
          if (riskWorkflowManaged && validated.egcs_fc_riskscore !== undefined && validated.egcs_fc_riskscore !== null) {
            return await badRequest(event, 'AGREEMENT_RISK_SCORE_WORKFLOW_MANAGED', 'apiErrors.agreement.risk_score_workflow_managed')
          }
          if (!riskWorkflowManaged && validated.egcs_fc_riskscore !== undefined && validated.egcs_fc_riskscore !== null) {
            const riskRatingContext = await resolveAgreementRiskRatingContext(validated.egcs_fc_riskscore, streamId, trx)
            if (!riskRatingContext) {
              return await badRequest(event, 'INVALID_AGREEMENT_RISK_SCORE', 'apiErrors.agreement.invalid_risk_score')
            }
          }

          if (!await isAgreementHoldbackBasisValid(String(validated.egcs_fc_holdbackbasis), streamId, trx)) {
            return await badRequest(event, 'INVALID_AGREEMENT_HOLDBACK_BASIS', 'apiErrors.agreement.invalid_holdback_basis')
          }

          const creatorId = await resolveAssignmentCommonUserId(trx, authContext.userId)
          if (!creatorId) return await badRequest(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')

          const values = mapAgreementWriteValues(
            validated,
            subtypeContext.agreementType
          ) as Insertable<FundingCaseAgreementProfileTable>
          values.egcs_fc_customfields = await mergeAgreementCustomFields(event, trx, streamId, {}, validated.egcs_fc_customfields ?? {})
          values.egcs_fc_status = await lockAgencyDraftStatus(trx, currentStreamContext.agencyId)
          const createdAgreement = await trx
            .insertInto('Funding_Case_Agreement_Profile')
            .values(values)
            .returningAll()
            .executeTakeFirstOrThrow()

          await createPrimaryEntityAssignment(
            trx,
            'fundingcaseagreement',
            String(createdAgreement.id),
            creatorId
          )

          await trx
            .insertInto('Funding_Case_Agreement_Applicant_Recipient')
            .values(validated.applicant_recipient_ids.map(applicantRecipientId => ({
              egcs_fc_fundingagreement: createdAgreement.id,
              egcs_fc_applicantrecipient: applicantRecipientId
            } satisfies Insertable<FundingCaseAgreementApplicantRecipientTable>)))
            .execute()

          await useNitroApp().hooks.callHook('agreement:profile:created', {
            event,
            db: trx,
            agreementId: String(createdAgreement.id),
            streamId,
            rawBody: validated as Record<string, unknown>,
            validatedBody: validated,
            createdAgreement
          })

          return createdAgreement
        })
      } catch (error: unknown) {
        if (error instanceof AgreementCreateScopeChanged) {
          lockContext = error.context
          continue
        }
        throw error
      }
    }
    return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
