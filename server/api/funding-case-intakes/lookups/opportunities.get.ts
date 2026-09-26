import { sql } from 'kysely'
import { z } from 'zod'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const QuerySchema = PaginationSchema.extend({ ids: z.union([
  PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)
]).optional() })

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search, ids } = await getValidatedQueryI18n(event, QuerySchema)
  const selectedIds = ids ? (Array.isArray(ids) ? ids : [ids]).map(String) : []
  const rows = await event.context.$db.selectFrom('Funding_Opportunity_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Profile.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select([
      'Funding_Opportunity_Profile.id', 'egcs_fo_name_en as label_en', 'egcs_fo_name_fr as label_fr',
      'Transfer_Payment_Stream.id as stream_id', 'Transfer_Payment_Profile.id as program_id',
      'Agency_Profile.id as agency_id'
    ])
    .where('Funding_Opportunity_Profile._deleted', '=', false)
    .where(eb => eb.or([
      eb.and([
        eb('Funding_Opportunity_Profile.egcs_fo_status', '=', 'open'),
        eb('Funding_Opportunity_Profile.egcs_fo_datestart', '<=', sql<Date>`CURRENT_DATE`),
        eb('Funding_Opportunity_Profile.egcs_fo_dateend', '>=', sql<Date>`CURRENT_DATE`)
      ]),
      ...(selectedIds.length ? [eb('Funding_Opportunity_Profile.id', 'in', selectedIds)] : [])
    ]))
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .orderBy('Funding_Opportunity_Profile.egcs_fo_name_en').execute()
  const visible = rows.filter(row => (!selectedIds.length || selectedIds.includes(String(row.id)))
    && auth.userAbilities.authorize('funding_case', 'create', {
      type: 'entity', agencyId: String(row.agency_id),
      path: [{ type: 'transfer_payment', id: String(row.program_id) }]
    })).filter(row => !search || [row.label_en, row.label_fr].some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  return { items: visible.slice((page - 1) * limit, page * limit)
    .map(({ agency_id: _agencyId, program_id: _programId, stream_id: _streamId, ...row }) => row),
  total: visible.length, page, limit }
})
