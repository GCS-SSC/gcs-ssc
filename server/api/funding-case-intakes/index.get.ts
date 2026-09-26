import { requireAuthContext } from '~~/server/utils/authorize'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const rows = await event.context.$db.selectFrom('Funding_Case_Intake_Profile')
    .innerJoin('Funding_Opportunity_Profile', 'Funding_Opportunity_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_fundingopportunity')
    .innerJoin('Applicant_Recipient_Profile', 'Applicant_Recipient_Profile.id', 'Funding_Case_Intake_Profile.egcs_fi_applicantrecipient')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select([
      'Funding_Case_Intake_Profile.id', 'egcs_fi_applicationid', 'egcs_fi_fundingopportunity',
      'egcs_fi_applicantrecipient', 'egcs_fi_status',
      'Funding_Opportunity_Profile.egcs_fo_name_en as opportunity_name_en',
      'Funding_Opportunity_Profile.egcs_fo_name_fr as opportunity_name_fr',
      'Applicant_Recipient_Profile.egcs_ar_legalname_en as proponent_name_en',
      'Applicant_Recipient_Profile.egcs_ar_legalname_fr as proponent_name_fr',
      'Transfer_Payment_Stream.id as stream_id',
      'Transfer_Payment_Profile.id as program_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Intake_Profile._deleted', '=', false)
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .orderBy('Funding_Case_Intake_Profile.id', 'desc').execute()
  const visible = rows.filter(row => auth.userAbilities.authorize('funding_case', 'read', {
    type: 'entity', agencyId: String(row.agency_id),
    path: [
      { type: 'transfer_payment', id: String(row.program_id) },
      { type: 'transfer_payment_stream', id: String(row.stream_id) }
    ]
  })).filter(row => !search || String(row.egcs_fi_applicationid).includes(search))
  return {
    items: visible.slice((page - 1) * limit, page * limit)
      .map(({ agency_id: _agencyId, program_id: _programId, stream_id: _streamId, ...row }) => row),
    total: visible.length, stats: { total: visible.length }, page, limit
  }
})
