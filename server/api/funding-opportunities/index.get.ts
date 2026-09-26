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
    path: [{ type: 'transfer_payment', id: String(row.program_id) }]
  })).filter(row => !search || [row.egcs_fo_name_en, row.egcs_fo_name_fr]
    .some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  const pageRows = visible.slice((page - 1) * limit, page * limit)
  const links = pageRows.length
    ? await db.selectFrom('Funding_Opportunity_Stream')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Stream.egcs_fo_transferpaymentstream')
        .select(['Funding_Opportunity_Stream.egcs_fo_fundingopportunity as opportunity_id', 'Transfer_Payment_Stream.id',
          'Transfer_Payment_Stream.egcs_tp_name_en as name_en', 'Transfer_Payment_Stream.egcs_tp_name_fr as name_fr'])
        .where('Funding_Opportunity_Stream.egcs_fo_fundingopportunity', 'in', pageRows.map(row => String(row.id)))
        .where('Funding_Opportunity_Stream._deleted', '=', false).execute()
    : []
  return {
    items: pageRows.map(({ agency_id: _agencyId, program_id: _programId, ...row }) => {
      const streams = links.filter(link => String(link.opportunity_id) === String(row.id))
        .map(link => ({ id: String(link.id), name_en: link.name_en, name_fr: link.name_fr }))
        .sort((a, b) => a.id === String(row.egcs_fo_transferpaymentstream)
          ? -1
          : b.id === String(row.egcs_fo_transferpaymentstream)
            ? 1
            : a.id.localeCompare(b.id, undefined, { numeric: true }))
      return { ...row, egcs_fo_transferpaymentstreams: streams.map(stream => stream.id), streams }
    }),
    total: visible.length, stats: { total: visible.length }, page, limit
  }
})
