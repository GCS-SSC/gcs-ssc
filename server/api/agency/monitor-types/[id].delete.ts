import { authorizeActiveAgencySubentity, softDeleteActiveAgencySubentity } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(event, 'Agency_Monitor_Type', id, 'delete', {
    code: 'MONITOR_TYPE_NOT_FOUND', key: 'apiErrors.transfer_payment.monitor_type_not_found'
  })
  const deleted = await db.transaction().execute(async trx => await softDeleteActiveAgencySubentity(
    event, trx, 'Agency_Monitor_Type', id, agencyId, async lockedTrx => {
      const linked = await lockedTrx.selectFrom('Transfer_Payment_Monitor_Type').select('id')
        .where('egcs_tp_agencymonitortype', '=', id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (linked) return await badRequest(event, 'MONITOR_TYPE_IN_USE', 'apiErrors.transfer_payment.monitor_type_in_use')
    }
  ))
  if (!deleted) return await notFound(event, 'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found')
  return { success: true }
})
