import { StatusDefinitionCreateSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { statusCatalogService } from '~~/server/utils/status-catalog'
import { throwIfStatusConstraintError } from '~~/server/utils/status-administration'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, StatusDefinitionCreateSchema)
  if (body.readOnly || body.terminal) {
    await authorize(event, 'agency', 'delete', { type: 'agency', agencyId })
  }
  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      return await trx.insertInto('Common_Status').values({
        egcs_cn_agency: agencyId, egcs_cn_name_en: body.nameEn, egcs_cn_name_fr: body.nameFr,
        egcs_cn_color: body.color, egcs_cn_icon: body.icon, egcs_cn_readonly: body.readOnly,
        egcs_cn_terminal: body.terminal
      }).returningAll().executeTakeFirstOrThrow()
    }, body.readOnly || body.terminal ? 'delete' : 'update')
  } catch (error) {
    await throwIfStatusConstraintError(event, error)
  }
  const catalog = event.context.$statusCatalog ?? statusCatalogService
  catalog?.invalidateAgency(agencyId)
  void catalog?.refreshAgency(event.context.$db, agencyId).catch(() => undefined)
  return result
})
