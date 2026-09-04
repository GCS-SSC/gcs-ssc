import { authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { canAccessApplicantRecipient, resolveApplicantRecipientMutationPermissions } from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- authorization is performed with a fresh auth context inside the repeatable-read transaction.
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(id)) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    const context = await authorizeWithFreshAuthContext(
      event, authContext, 'applicant_recipient', 'read', async ({ context: freshContext }) => {
        const canRead = await canAccessApplicantRecipient(freshContext, id, 'read', trx)
        return canRead ? { bypass: true } : { denied: true }
      })

    const profile = await trx
      .selectFrom('Applicant_Recipient_Profile')
      .leftJoin('Agency_Applicant_Recipient_Subtype', 'Agency_Applicant_Recipient_Subtype.id', 'Applicant_Recipient_Profile.egcs_ar_applicantrecipientsubtypes')
      .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
      .where('Applicant_Recipient_Profile.id', '=', id)
      .where('Applicant_Recipient_Profile._deleted', '=', false)
      .select([
        'Applicant_Recipient_Profile.id as id',
        'Applicant_Recipient_Profile.egcs_ar_description_en as egcs_ar_description_en',
        'Applicant_Recipient_Profile.egcs_ar_description_fr as egcs_ar_description_fr',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_en as egcs_ar_operatingname_en',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as egcs_ar_operatingname_fr',
        'Applicant_Recipient_Profile.egcs_ar_applicantrecipientsubtypes as egcs_ar_applicantrecipientsubtypes',
        'Applicant_Recipient_Profile.egcs_ar_leadagency as egcs_ar_leadagency',
        'Applicant_Recipient_Profile.egcs_ar_legalname_en as egcs_ar_legalname_en',
        'Applicant_Recipient_Profile.egcs_ar_legalname_fr as egcs_ar_legalname_fr',
        'Applicant_Recipient_Profile.egcs_ar_researchorganization_en as egcs_ar_researchorganization_en',
        'Applicant_Recipient_Profile.egcs_ar_researchorganization_fr as egcs_ar_researchorganization_fr',
        'Applicant_Recipient_Profile.egcs_ar_active as egcs_ar_active',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_en as subtype_name_en',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr as subtype_name_fr',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_applicantrecipienttype as subtype_type',
        'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
      ])
      .executeTakeFirst()

    if (!profile) {
      return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
    }

    const permissions = (await resolveApplicantRecipientMutationPermissions(context, [id], trx)).get(id)
    const canUpdate = permissions?.canUpdate === true
    const canDelete = permissions?.canDelete === true

    return {
      ...profile,
      can_update: canUpdate,
      can_delete: canDelete,
      can_create_child_records: permissions?.canCreate === true,
      can_update_child_records: canUpdate,
      can_delete_child_records: canDelete
    }
  })
})
