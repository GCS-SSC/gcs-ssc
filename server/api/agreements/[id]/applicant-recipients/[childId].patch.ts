import { sql } from 'kysely'
import { badRequest, throwApiError } from '~~/server/utils/api-errors'
import { FundingCaseAgreementApplicantRecipientPatchSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import {
  canAccessApplicantRecipientIds,
  lockActiveApplicantRecipientIds
} from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isAgreementApplicantRecipientInUse } from '~~/server/utils/agreement-applicant-recipient'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_APPLICANT_RECIPIENT_NOT_FOUND', 'apiErrors.agreement.applicant_recipient_not_found')
  }

  const agreementContext = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, _currentContext, authContext) => {
      const agreement = await assertAgreementExists(event, agreementId, trx)
      if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
        return agreement
      }

      const existing = await assertAgreementChildExists(
        event,
        trx
          .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
          .where('id', '=', childId)
          .where('egcs_fc_fundingagreement', '=', agreementId)
          .where('_deleted', '=', false)
          .select(['id', 'egcs_fc_applicantrecipient'])
          .executeTakeFirst(),
        ...AGREEMENT_CHILD_ERROR_KEYS.applicantRecipientNotFound
      )
      if (!existing || typeof existing !== 'object' || !('id' in existing)) {
        return existing
      }

      const validated = await readValidatedBodyI18n(event, FundingCaseAgreementApplicantRecipientPatchSchema)
      if (!Object.hasOwn(validated, 'egcs_fc_applicantrecipient')) {
        return await trx
          .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
          .innerJoin(
            'Applicant_Recipient_Profile',
            'Applicant_Recipient_Profile.id',
            'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient'
          )
          .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
          .where('Funding_Case_Agreement_Applicant_Recipient.id', '=', childId)
          .select([
            'Funding_Case_Agreement_Applicant_Recipient.id as id',
            'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient as egcs_fc_applicantrecipient',
            sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('applicant_recipient_name_en'),
            sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('applicant_recipient_name_fr'),
            'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
            'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
          ])
          .executeTakeFirstOrThrow()
      }

      const applicantRecipientId = String(validated.egcs_fc_applicantrecipient)
      if (
        applicantRecipientId !== String(existing.egcs_fc_applicantrecipient)
        && await isAgreementApplicantRecipientInUse(trx, agreementId, childId)
      ) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'AGREEMENT_APPLICANT_RECIPIENT_IN_USE',
          key: 'apiErrors.agreement.applicant_recipient_in_use'
        })
      }
      if (
        applicantRecipientId !== String(existing.egcs_fc_applicantrecipient)
        && (
          !await lockActiveApplicantRecipientIds(trx, [applicantRecipientId])
          || !await canAccessApplicantRecipientIds(authContext, [applicantRecipientId], 'read', trx)
        )
      ) {
        return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
      }

      const applicantRecipient = await trx
        .selectFrom('Applicant_Recipient_Profile')
        .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
        .where('Applicant_Recipient_Profile.id', '=', applicantRecipientId)
        .where('Applicant_Recipient_Profile._deleted', '=', false)
        .where(eb => eb.or([
          eb('Agency_Profile._deleted', '=', false),
          eb('Agency_Profile.id', 'is', null)
        ]))
        .select([
          'Applicant_Recipient_Profile.id as id',
          sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('applicant_recipient_name_en'),
          sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('applicant_recipient_name_fr'),
          'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
          'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
        ])
        .executeTakeFirst()

      if (!applicantRecipient) {
        return await badRequest(event, 'INVALID_AGREEMENT_APPLICANT_RECIPIENT', 'apiErrors.agreement.invalid_applicant_recipient')
      }

      const updated = await trx
        .updateTable('Funding_Case_Agreement_Applicant_Recipient')
        .set({
          egcs_fc_applicantrecipient: validated.egcs_fc_applicantrecipient
        })
        .where('id', '=', childId)
        .where('egcs_fc_fundingagreement', '=', agreementId)
        .where('_deleted', '=', false)
        .returning(['id', 'egcs_fc_applicantrecipient'])
        .executeTakeFirstOrThrow()

      return {
        ...updated,
        applicant_recipient_name_en: applicantRecipient.applicant_recipient_name_en,
        applicant_recipient_name_fr: applicantRecipient.applicant_recipient_name_fr,
        lead_agency_name_en: applicantRecipient.lead_agency_name_en,
        lead_agency_name_fr: applicantRecipient.lead_agency_name_fr
      }
    }, { action: 'update', blocksApprovalSubmission: true })
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
})
