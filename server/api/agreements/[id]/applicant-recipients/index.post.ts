import { assertAgreementProponentType } from '~~/server/utils/agreement-proponent-type'
import type { Insertable } from 'kysely'
import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { FundingCaseAgreementApplicantRecipientCreateSchema } from '~~/shared/types/schemas'
import type { FundingCaseAgreementApplicantRecipientTable } from '~~/shared/types/database'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import {
  canAccessApplicantRecipientIds,
  lockActiveApplicantRecipientIds
} from '~~/server/utils/applicant-recipient-auth'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'

/** Signals that a concurrent Proponent move invalidated the selected Agency lock. */
class SelectedLeadAgencyChanged extends Error {}

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementApplicantRecipientCreateSchema)
  const applicantRecipientId = String(validated.egcs_fc_applicantrecipient)
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const selectedAgencyHint = await db.selectFrom('Applicant_Recipient_Profile')
        .where('id', '=', applicantRecipientId)
        .where('_deleted', '=', false)
        .select('egcs_ar_leadagency')
        .executeTakeFirst()
      try {
        return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, _currentContext, authContext) => {
          // Lock the Proponent's Agency before its profile. Agency deletion and
          // lead-agency moves use the same order, so a completed deletion cannot
          // leave a new Agreement relationship pointing at the removed owner.
          if (selectedAgencyHint?.egcs_ar_leadagency) {
            const selectedAgency = await trx.selectFrom('Agency_Profile')
              .where('id', '=', selectedAgencyHint.egcs_ar_leadagency)
              .where('_deleted', '=', false)
              .select('id')
              .forShare()
              .executeTakeFirst()
            if (!selectedAgency) {
              return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
            }
          }
          if (!await lockActiveApplicantRecipientIds(trx, [applicantRecipientId])) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }
          if (!await canAccessApplicantRecipientIds(authContext, [applicantRecipientId], 'read', trx)) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }

          const applicantRecipient = await trx
            .selectFrom('Applicant_Recipient_Profile')
            .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
            .where('Applicant_Recipient_Profile.id', '=', applicantRecipientId)
            .where('Applicant_Recipient_Profile._deleted', '=', false)
            .select([
              'Applicant_Recipient_Profile.id as id',
              'Applicant_Recipient_Profile.egcs_ar_leadagency as lead_agency_id',
              sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('applicant_recipient_name_en'),
              sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('applicant_recipient_name_fr'),
              'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
              'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
            ])
            .forShare('Applicant_Recipient_Profile')
            .executeTakeFirst()

          if (!applicantRecipient) {
            return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
          }
          if (applicantRecipient.lead_agency_id !== selectedAgencyHint?.egcs_ar_leadagency) throw new SelectedLeadAgencyChanged()

          await assertAgreementProponentType(event, trx, _currentContext.streamId, applicantRecipientId, validated.egcs_fc_applicantrecipientsubtype)
          const values: Insertable<FundingCaseAgreementApplicantRecipientTable> = {
            egcs_fc_fundingagreement: agreementId,
            ...validated
          }

          const inserted = await trx
            .insertInto('Funding_Case_Agreement_Applicant_Recipient')
            .values(values)
            .returning(['id', 'egcs_fc_applicantrecipient', 'egcs_fc_applicantrecipientsubtype'])
            .executeTakeFirstOrThrow()
          return {
            ...inserted,
            applicant_recipient_name_en: applicantRecipient.applicant_recipient_name_en,
            applicant_recipient_name_fr: applicantRecipient.applicant_recipient_name_fr,
            lead_agency_name_en: applicantRecipient.lead_agency_name_en,
            lead_agency_name_fr: applicantRecipient.lead_agency_name_fr
          }
        }, { action: 'create', blocksApprovalSubmission: true })
      } catch (error) {
        if (!(error instanceof SelectedLeadAgencyChanged)) throw error
        if (attempt === 2) {
          return await badRequest(event, 'AGREEMENT_APPLICANT_RECIPIENT_AGENCY_CHANGED', 'apiErrors.request.invalid_status')
        }
      }
    }
    return await badRequest(event, 'AGREEMENT_APPLICANT_RECIPIENT_AGENCY_CHANGED', 'apiErrors.request.invalid_status')
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
