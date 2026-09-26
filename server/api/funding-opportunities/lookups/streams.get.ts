import { requireAuthContext } from '~~/server/utils/authorize'
import { z } from 'zod'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const QuerySchema = PaginationSchema.extend({ ids: z.union([
  PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema).max(100)
]).optional() })

export default defineEventHandler(async event => {
  const auth = await requireAuthContext(event)
  const { page, limit, search, ids } = await getValidatedQueryI18n(event, QuerySchema)
  const selectedIds = ids ? (Array.isArray(ids) ? ids : [ids]).map(String) : []
  const rows = await event.context.$db.selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select([
      'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream.egcs_tp_name_en as label_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as label_fr',
      'Transfer_Payment_Profile.id as program_id', 'Agency_Profile.id as agency_id'
    ])
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Stream.egcs_tp_active', '=', true)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Transfer_Payment_Profile.egcs_tp_active', '=', true)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Profile.egcs_ay_active', '=', true)
    .orderBy('Transfer_Payment_Stream.egcs_tp_name_en').execute()
  const visible = rows.filter(row => (!selectedIds.length || selectedIds.includes(String(row.id)))
    && auth.userAbilities.authorize('transfer_payment', 'create', {
      type: 'entity', agencyId: String(row.agency_id),
      path: [
        { type: 'transfer_payment', id: String(row.program_id) },
        { type: 'transfer_payment_stream', id: String(row.id) }
      ]
    })).filter(row => !search || [row.label_en, row.label_fr].some(value => value.toLocaleLowerCase().includes(search.toLocaleLowerCase())))
  return { items: visible.slice((page - 1) * limit, page * limit)
    .map(({ agency_id: _agencyId, program_id: _programId, ...row }) => row),
  total: visible.length, page, limit }
})
