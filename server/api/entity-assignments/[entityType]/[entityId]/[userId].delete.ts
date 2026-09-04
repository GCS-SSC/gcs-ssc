import { badRequest, notFound } from '~~/server/utils/api-errors'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { EntityAssignmentRemoveSchema, EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, { entityType: getRouterParam(event, 'entityType'), entityId: getRouterParam(event, 'entityId') })
  const body = await parseI18n(event, EntityAssignmentRemoveSchema, { userId: getRouterParam(event, 'userId') })
  try {
    return await executeEntityAssignmentManagement(event, target, async trx => {
      const rows = await trx.selectFrom('Common_Entity_Assignment').select(['id', 'egcs_cn_user', 'egcs_cn_isprimary']).where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
      const row = rows.find(item => String(item.egcs_cn_user) === body.userId)
      if (!row || row.egcs_cn_isprimary || rows.length <= 1) return await badRequest(event, 'ASSIGNMENT_REQUIRED', 'apiErrors.request.invalid')
      return await trx.updateTable('Common_Entity_Assignment').set({ _deleted: true }).where('id', '=', String(row.id)).returningAll().executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 403) {
      return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    }
    throw error
  }
})
