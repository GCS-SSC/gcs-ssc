import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { AgencyClaimReconciliationStatusConfigurationSchema } from '~~/shared/types/schemas/agency'
import { getDatabaseConstraintName } from '~~/server/utils/database-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyClaimReconciliationStatusConfigurationSchema)

  const configuredIds = [...new Set(
    [body.startStatusId, body.finalStatusId].filter((id): id is string => id !== null)
  )]
  let updated
  try {
    updated = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      if (configuredIds.length > 0) {
        const statuses = await trx.selectFrom('Common_Status')
          .select(['id', 'egcs_cn_readonly', 'egcs_cn_terminal'])
          .where('egcs_cn_agency', '=', agencyId)
          .where('id', 'in', configuredIds)
          .where('_deleted', '=', false)
          .orderBy('id', 'asc')
          .forUpdate()
          .execute()
        if (new Set(statuses.map(status => String(status.id))).size !== configuredIds.length) {
          return await badRequest(event, 'INVALID_CLAIM_RECONCILIATION_STATUS', 'apiErrors.request.invalid_status')
        }
        const startStatus = statuses.find(status => String(status.id) === body.startStatusId)
        if (startStatus && (startStatus.egcs_cn_readonly || startStatus.egcs_cn_terminal)) {
          return await badRequest(event, 'INVALID_CLAIM_RECONCILIATION_START_STATUS', 'apiErrors.request.invalid_status')
        }
        const finalStatus = statuses.find(status => String(status.id) === body.finalStatusId)
        if (finalStatus && !finalStatus.egcs_cn_terminal) {
          return await badRequest(event, 'INVALID_CLAIM_RECONCILIATION_FINAL_STATUS', 'apiErrors.request.invalid_status')
        }
      }
      return await trx.updateTable('Agency_Profile')
        .set({
          egcs_ay_claimreconciliationstartstatus: body.startStatusId,
          egcs_ay_claimreconciliationfinalstatus: body.finalStatusId
        })
        .where('id', '=', agencyId)
        .where('_deleted', '=', false)
        .returning(['egcs_ay_claimreconciliationstartstatus', 'egcs_ay_claimreconciliationfinalstatus'])
        .executeTakeFirst()
    })
  } catch (error) {
    if (['ay_chk_claim_reconciliation_start_status_agency', 'ay_chk_claim_reconciliation_final_status_agency']
      .includes(getDatabaseConstraintName(error) ?? '')) {
      return await badRequest(event, 'INVALID_CLAIM_RECONCILIATION_STATUS', 'apiErrors.request.invalid_status')
    }
    throw error
  }
  if (!updated) return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')

  return {
    startStatusId: updated.egcs_ay_claimreconciliationstartstatus ?? null,
    finalStatusId: updated.egcs_ay_claimreconciliationfinalstatus ?? null
  }
})
