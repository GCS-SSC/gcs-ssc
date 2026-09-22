import { assertAgreementProponentType } from '~~/server/utils/agreement-proponent-type'
import { resolveAgreementNumberProvider, generateAgreementNumber } from '~~/server/utils/agreement-number-provider'
import { mergeAgreementCustomFields } from '~~/server/utils/agreement-custom-fields'
import type { Insertable } from 'kysely'
import { parseI18n } from '~~/server/utils/api-validate'
import { FundingCaseAgreementCreateSchema, FundingCaseAgreementGeneratedCreateSchema } from '~~/shared/types/schemas'
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
  resolveAgreementSubtypeContext,
  type AgreementWriteValues
} from '~~/server/utils/agreement'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import type {
  FundingCaseAgreementApplicantRecipientTable
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
   * @returns The validated or generated result.
 */
  constructor(readonly context: NonNullable<Awaited<ReturnType<typeof resolveAgreementStreamScopeContext>>>) {
    super('Agreement stream scope changed while acquiring lifecycle locks.')
  }
}

const AGREEMENT_CREATE_SCOPE_LOCK_MAX_ATTEMPTS = 3

export default defineEventHandler(async event => {
  const db = event.context.$db
  const requested = await readValidatedBodyI18n(event, FundingCaseAgreementGeneratedCreateSchema.and(z.object({
    confirmations: z.array(z.string().trim().min(1)).default([])
  })))

  const streamId = String(requested.egcs_fc_transferpaymentstream)
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
          const agency = await trx.selectFrom('Agency_Profile')
            .select(['id', 'egcs_ay_abbreviation_en', 'egcs_ay_abbreviation_fr'])
            .where('id', '=', lockContext.agencyId)
            .where('_deleted', '=', false)
            .forShare('Agency_Profile')
            .executeTakeFirst()
          const program = await trx.selectFrom('Transfer_Payment_Profile')
            .select(['id', 'egcs_tp_abbreviation_en', 'egcs_tp_abbreviation_fr'])
            .where('id', '=', lockContext.profileId)
            .where('_deleted', '=', false)
            .forShare('Transfer_Payment_Profile')
            .executeTakeFirst()
          const lockedStreams = await lockTransferPaymentStreams(trx, [streamId])
          if (!lockedStreams.has(streamId)) {
            return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
          }
          const currentStreamContext = await resolveAgreementStreamScopeContext(streamId, trx, { requireAvailable: true })
          if (!currentStreamContext) {
            return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
          }
          if (currentStreamContext.agencyId !== lockContext.agencyId || currentStreamContext.profileId !== lockContext.profileId) {
            throw new AgreementCreateScopeChanged(currentStreamContext)
          }
          if (!agency || !program) {
            return await badRequest(event, 'INVALID_AGREEMENT_STREAM', 'apiErrors.agreement.invalid_stream')
          }

          await authorizeWithFreshAuthContext(event, authContext, 'agreement', 'create', async ({ context }) => {
            const canCreate = await canAccessAgreementStream(context, 'create', currentStreamContext.scope, trx)
            if (canCreate) return { bypass: true }
            return { scope: currentStreamContext.scope }
          })

          const validated = { ...requested }
          const provider = await resolveAgreementNumberProvider(event, trx, currentStreamContext.agencyId, streamId)
          if (provider && validated.egcs_fc_agreementnumber !== undefined) {
            return await badRequest(event, 'AGREEMENT_NUMBER_MANAGED', 'apiErrors.agreement.number_managed')
          }
          if (!provider && validated.egcs_fc_agreementnumber === undefined) {
            await parseI18n(event, FundingCaseAgreementCreateSchema, validated)
          }

          const applicantRecipientIds = validated.egcs_fc_applicantrecipients.map(item => String(item.egcs_fc_applicantrecipient))
          if (!await lockActiveApplicantRecipientIds(trx, applicantRecipientIds)) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }
          if (!await canAccessApplicantRecipientIds(authContext, applicantRecipientIds, 'read', trx)) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }
          const liveApplicantRecipients = await trx.selectFrom('Applicant_Recipient_Profile')
            .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
            .select('Applicant_Recipient_Profile.id')
            .where('Applicant_Recipient_Profile.id', 'in', applicantRecipientIds)
            .where('Applicant_Recipient_Profile._deleted', '=', false)
            .orderBy('Applicant_Recipient_Profile.id', 'asc')
            .forShare('Applicant_Recipient_Profile')
            .execute()
          if (liveApplicantRecipients.length !== applicantRecipientIds.length) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }

          for (const [index, relationship] of validated.egcs_fc_applicantrecipients.entries()) {
            await assertAgreementProponentType(event, trx, streamId, relationship.egcs_fc_applicantrecipient,
              relationship.egcs_fc_applicantrecipientsubtype, ['egcs_fc_applicantrecipients', index, 'egcs_fc_applicantrecipientsubtype'])
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

          /** Inserts one available number and preserves allocations across conflicts.
           * @returns The created agreement.
           */
          const createAgreement = async () => {
            for (let attempt = 0; attempt < 100; attempt += 1) {
              if (provider) {
                const stream = await trx.selectFrom('Transfer_Payment_Stream').select(['egcs_tp_name_en', 'egcs_tp_name_fr', 'egcs_tp_abbreviation_en', 'egcs_tp_abbreviation_fr'])
                  .where('id', '=', streamId).executeTakeFirstOrThrow()
                // Existing scope locks serialize creators and configuration changes. Candidate checks
                // avoid aborting the transaction on ordinary pre-existing-number collisions.

                validated.egcs_fc_agreementnumber = await generateAgreementNumber(event, trx, provider, {
                  agencyId: currentStreamContext.agencyId, programId: currentStreamContext.profileId, streamId,
                  sources: {
                    'agreement.title_en': validated.egcs_fc_title_en, 'agreement.title_fr': validated.egcs_fc_title_fr,
                    'agreement.startDate': validated.egcs_fc_authorizedassistancestartdate.toISOString().split('T')[0]!,
                    'agreement.endDate': validated.egcs_fc_authorizedassistanceenddate.toISOString().split('T')[0]!,
                    'agreement.financialSystemNumber': String(validated.egcs_fc_financialsystemnumber),
                    'agency.id': currentStreamContext.agencyId,
                    'agency.name_en': currentStreamContext.agencyNameEn, 'agency.name_fr': currentStreamContext.agencyNameFr,
                    'program.id': currentStreamContext.profileId,
                    'program.name_en': currentStreamContext.programNameEn, 'program.name_fr': currentStreamContext.programNameFr,
                    'stream.id': streamId, 'stream.name_en': stream.egcs_tp_name_en, 'stream.name_fr': stream.egcs_tp_name_fr,
                    'agency.abbreviation_en': agency.egcs_ay_abbreviation_en, 'agency.abbreviation_fr': agency.egcs_ay_abbreviation_fr,
                    'program.abbreviation_en': program.egcs_tp_abbreviation_en, 'program.abbreviation_fr': program.egcs_tp_abbreviation_fr,
                    'stream.abbreviation_en': stream.egcs_tp_abbreviation_en, 'stream.abbreviation_fr': stream.egcs_tp_abbreviation_fr
                  }
                })
                const collision = await trx.selectFrom('Funding_Case_Agreement_Profile').select('id')
                  .where('egcs_fc_transferpaymentstream', '=', streamId)
                  .where('egcs_fc_agreementnumber', '=', validated.egcs_fc_agreementnumber)
                  .executeTakeFirst()
                if (collision) continue
              }
              const completed = await parseI18n(event, FundingCaseAgreementCreateSchema, validated)
              const similarityWarnings = await collectFundingHistorySimilarityWarnings(authContext, {
                egcs_ar_agencyname_en: currentStreamContext.agencyNameEn,
                egcs_ar_agencyname_fr: currentStreamContext.agencyNameFr,
                egcs_ar_programname_en: currentStreamContext.programNameEn,
                egcs_ar_programname_fr: currentStreamContext.programNameFr,
                egcs_ar_agreementnumber: completed.egcs_fc_agreementnumber
              }, trx, { proposedSource: 'system' })
              await requireFundingHistorySimilarityConfirmation(
                event,
                similarityWarnings,
                validated.confirmations
              )

              const values = mapAgreementWriteValues(
                completed,
                subtypeContext.agreementType
              ) as AgreementWriteValues
              values.egcs_fc_customfields = await mergeAgreementCustomFields(event, trx, streamId, {}, validated.egcs_fc_customfields ?? {})
              values.egcs_fc_status = await lockAgencyDraftStatus(trx, currentStreamContext.agencyId)
              // Canonical Stream locks serialize supported number writers. A final
              // uniqueness failure rolls back the entire aggregate and its counters.
              return await trx
                .insertInto('Funding_Case_Agreement_Profile')
                .values(values)
                .returningAll()
                .executeTakeFirstOrThrow()
            }
            return await badRequest(event, 'AGREEMENT_NUMBER_EXHAUSTED', 'apiErrors.agreement.number_exhausted')
          }
          const createdAgreement = await createAgreement()

          await createPrimaryEntityAssignment(
            trx,
            'fundingcaseagreement',
            String(createdAgreement.id),
            creatorId
          )

          await trx
            .insertInto('Funding_Case_Agreement_Applicant_Recipient')
            .values(validated.egcs_fc_applicantrecipients.map(relationship => ({
              egcs_fc_fundingagreement: createdAgreement.id,
              ...relationship
            } satisfies Insertable<FundingCaseAgreementApplicantRecipientTable>)))
            .execute()

          await useNitroApp().hooks.callHook('agreement:profile:created', {
            event,
            db: trx,
            agreementId: String(createdAgreement.id),
            streamId,
            rawBody: validated as Record<string, unknown>,
            validatedBody: { ...validated, egcs_fc_agreementnumber: createdAgreement.egcs_fc_agreementnumber },
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
