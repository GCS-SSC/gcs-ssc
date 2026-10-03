import { AgencyMonitorTypePatchSchema } from '~~/shared/types/schemas'
import { authorizeActiveAgencySubentity, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(event, 'Agency_Monitor_Type', id, 'update', {
    code: 'MONITOR_TYPE_NOT_FOUND', key: 'apiErrors.transfer_payment.monitor_type_not_found'
  })
  const body = await readValidatedBodyI18n(event, AgencyMonitorTypePatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      await trx.selectFrom('Agency_Monitor_Type').where('id', '=', id).select('id').forUpdate().executeTakeFirst()
      if (body.egcs_ay_receivableeligible === false) {
        const linked = await trx.selectFrom('Funding_Case_Agreement_Monitor_Followup as followup')
          .innerJoin('Funding_Case_Agreement_Monitor as monitor', 'monitor.id', 'followup.egcs_fc_fundingagreementmonitor')
          .innerJoin('Transfer_Payment_Monitor_Type as monitor_type', 'monitor_type.id', 'monitor.egcs_fc_type')
          .where('monitor_type.egcs_tp_agencymonitortype', '=', id)
          .where(eb => eb.or([eb('followup.egcs_fc_requiresreceivable', '=', true), eb.exists(eb.selectFrom('Funding_Case_Agreement_Account_Receivable as receivable').select('receivable.id').whereRef('receivable.egcs_fc_monitorfollowup', '=', 'followup.id'))]))
          .select('followup.id').executeTakeFirst()
        if (linked) return await badRequest(event, 'MONITOR_RECEIVABLE_IN_USE', 'apiErrors.agency.monitor_receivable_in_use')
      }
      return await trx.updateTable('Agency_Monitor_Type').set(body).where('id', '=', id)
        .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false)
        .returningAll().executeTakeFirst()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
  if (!result) return await notFound(event, 'MONITOR_TYPE_NOT_FOUND', 'apiErrors.transfer_payment.monitor_type_not_found')
  return result
})
