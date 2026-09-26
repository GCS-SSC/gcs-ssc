import { requireAuthContext } from '~~/server/utils/authorize'
import { requireFundingCaseAccess } from '~~/server/utils/funding-case-access'
import { notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const db = event.context.$db
  const scope = await requireFundingCaseAccess(event, id, 'read', db)
  const intake = await db.selectFrom('Funding_Case_Intake_Profile')
    .innerJoin('Funding_Opportunity_Profile', 'Funding_Opportunity_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_fundingopportunity')
    .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_applicantrecipient')
    .selectAll('Funding_Case_Intake_Profile')
    .select([
      'Funding_Opportunity_Profile.egcs_fo_name_en as opportunity_name_en',
      'Funding_Opportunity_Profile.egcs_fo_name_fr as opportunity_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as proponent_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as proponent_name_fr'
    ])
    .where('Funding_Case_Intake_Profile.id', '=', id).where('Funding_Case_Intake_Profile._deleted', '=', false).executeTakeFirst()
  if (!intake) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return { ...intake, agency_id: scope.agencyId, program_id: scope.transferPaymentId,
    stream_id: scope.streamId, stream_ids: scope.streamIds }
})
