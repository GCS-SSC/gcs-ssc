import { authorize, resolveTransferPaymentVisibility } from '~~/server/utils/authorize'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { sql } from 'kysely'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const auth = await authorize(event, 'transfer_payment', 'read', resolveTransferPaymentVisibility(db))
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const rows = await db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select([
      'Funding_Opportunity_Profile.id', 'egcs_fo_transferpaymentstream',
      sql<string>`to_char(egcs_fo_datestart, 'YYYY-MM-DD')`.as('egcs_fo_datestart'),
      sql<string>`to_char(egcs_fo_dateend, 'YYYY-MM-DD')`.as('egcs_fo_dateend'),
      'egcs_fo_name_en', 'egcs_fo_name_fr', 'egcs_fo_objective_en', 'egcs_fo_objective_fr',
      'egcs_fo_applicationschema', 'egcs_fo_status', 'Funding_Opportunity_Profile._deleted'
    ])
    .select(['Transfer_Payment_Profile.id as program_id', 'Transfer_Payment_Profile.egcs_tp_agency as agency_id'])
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .orderBy('Funding_Opportunity_Profile.id', 'desc').execute()
  const visible = rows.filter(row => auth.userAbilities.authorize('transfer_payment', 'read', {
    type: 'entity', agencyId: String(row.agency_id),
    path: [
      { type: 'transfer_payment', id: String(row.program_id) },
      { type: 'transfer_payment_stream', id: String(row.egcs_fo_transferpaymentstream) }
    ]
  })).filter(row => !search || [row.egcs_fo_name_en, row.egcs_fo_name_fr]
    .some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  return {
    items: visible.slice((page - 1) * limit, page * limit)
      .map(({ agency_id: _agencyId, program_id: _programId, ...row }) => row),
    total: visible.length, stats: { total: visible.length }, page, limit
  }
})
