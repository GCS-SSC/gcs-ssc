import { StatusDefinitionPatchSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { assertTerminalStatusCompatibleWithPublishedWorkflows, authorizeStatusDefinition, throwIfStatusConstraintError } from '~~/server/utils/status-administration'
import { statusCatalogService } from '~~/server/utils/status-catalog'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const statusId = getRouterParam(event, 'statusId')
  if (!statusId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(statusId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  const current = await authorizeStatusDefinition(event, statusId, 'update')
  if (current.egcs_cn_isdraft) return await throwApiError(event, { statusCode: 409, code: 'STATUS_DRAFT_IMMUTABLE', key: 'apiErrors.status.draft_immutable' })
  const body = await readValidatedBodyI18n(event, StatusDefinitionPatchSchema)
  const changesFlags = body.readOnly !== undefined || body.terminal !== undefined
  if (changesFlags) await authorize(event, 'agency', 'delete', { type: 'agency', agencyId: current.egcs_cn_agency })
  const mergedReadOnly = body.readOnly ?? current.egcs_cn_readonly
  const mergedTerminal = body.terminal ?? current.egcs_cn_terminal
  if (mergedReadOnly && mergedTerminal) return await badRequest(event, 'STATUS_FLAGS_EXCLUSIVE', 'validation.status_flags_exclusive')
  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, current.egcs_cn_agency, async trx => {
      const locked = await trx.selectFrom('Common_Status').selectAll()
        .where('id', '=', statusId)
        .where('egcs_cn_agency', '=', current.egcs_cn_agency)
        .forUpdate()
        .executeTakeFirst()
      if (!locked || locked._deleted) return undefined
      if (locked.egcs_cn_isdraft) return await throwApiError(event, { statusCode: 409, code: 'STATUS_DRAFT_IMMUTABLE', key: 'apiErrors.status.draft_immutable' })
      const readOnly = body.readOnly ?? locked.egcs_cn_readonly
      const terminal = body.terminal ?? locked.egcs_cn_terminal
      if (readOnly && terminal) return await badRequest(event, 'STATUS_FLAGS_EXCLUSIVE', 'validation.status_flags_exclusive')
      if (locked.egcs_cn_terminal && !terminal) {
        return await throwApiError(event, { statusCode: 409, code: 'STATUS_TERMINAL_PERMANENT', key: 'apiErrors.status.terminal_permanent' })
      }
      if (terminal && !locked.egcs_cn_terminal) {
        await assertTerminalStatusCompatibleWithPublishedWorkflows(event, trx, statusId)
      }
      if (Object.keys(body).length === 0) return locked
      return await trx.updateTable('Common_Status').set({
        ...(body.nameEn === undefined ? {} : { egcs_cn_name_en: body.nameEn }),
        ...(body.nameFr === undefined ? {} : { egcs_cn_name_fr: body.nameFr }),
        ...(body.color === undefined ? {} : { egcs_cn_color: body.color }),
        ...(body.icon === undefined ? {} : { egcs_cn_icon: body.icon }),
        ...(body.readOnly === undefined ? {} : { egcs_cn_readonly: body.readOnly }),
        ...(body.terminal === undefined ? {} : { egcs_cn_terminal: body.terminal })
      }).where('id', '=', statusId).where('_deleted', '=', false).returningAll().executeTakeFirst()
    }, changesFlags ? 'delete' : 'update')
  } catch (error) {
    await throwIfStatusConstraintError(event, error)
  }
  if (!result) return await notFound(event, 'STATUS_NOT_FOUND', 'apiErrors.status.not_found')
  const catalog = event.context.$statusCatalog ?? statusCatalogService
  catalog?.invalidateAgency(current.egcs_cn_agency)
  void catalog?.refreshAgency(event.context.$db, current.egcs_cn_agency).catch(() => undefined)
  return result
})
