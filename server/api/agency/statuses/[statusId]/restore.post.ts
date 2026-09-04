import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { assertStatusCanBeRestored, authorizeStatusDefinition } from '~~/server/utils/status-administration'
import { statusCatalogService } from '~~/server/utils/status-catalog'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- authorizeStatusDefinition scopes the row before a fresh Manager-authorized transaction.
export default defineEventHandler(async event => {
  const statusId = getRouterParam(event, 'statusId')
  if (!statusId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(statusId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const current = await authorizeStatusDefinition(event, statusId, 'delete')
  const result = await withActiveAgencyMutationTransaction(event, current.egcs_cn_agency, async trx => {
    const locked = await trx.selectFrom('Common_Status').selectAll()
      .where('id', '=', statusId)
      .where('egcs_cn_agency', '=', current.egcs_cn_agency)
      .forUpdate()
      .executeTakeFirst()
    if (!locked || !locked._deleted) return undefined
    await assertStatusCanBeRestored(event, trx, locked)
    return await trx.updateTable('Common_Status').set({ _deleted: false }).where('id', '=', statusId).where('_deleted', '=', true).returningAll().executeTakeFirst()
  }, 'delete')
  if (!result) return await notFound(event, 'STATUS_NOT_FOUND', 'apiErrors.status.not_found')
  const catalog = event.context.$statusCatalog ?? statusCatalogService
  catalog?.invalidateAgency(current.egcs_cn_agency)
  void catalog?.refreshAgency(event.context.$db, current.egcs_cn_agency).catch(() => undefined)
  return result
})
