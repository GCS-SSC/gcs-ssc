import { badRequest, notFound } from '~~/server/utils/api-errors'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { EntityAssignmentPromoteSchema, EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, { entityType: getRouterParam(event, 'entityType'), entityId: getRouterParam(event, 'entityId') })
  const body = await readValidatedBodyI18n(event, EntityAssignmentPromoteSchema)
  try {
    return await executeEntityAssignmentManagement(event, target, async trx => {
      const rows = await trx.selectFrom('Common_Entity_Assignment').select(['id', 'egcs_cn_user']).where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
      if (!rows.some(row => String(row.egcs_cn_user) === body.userId)) return await badRequest(event, 'ASSIGNMENT_USER_NOT_ASSIGNED', 'apiErrors.request.invalid')
      await trx.updateTable('Common_Entity_Assignment').set({ egcs_cn_isprimary: false }).where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId).where('_deleted', '=', false).execute()
      return await trx.updateTable('Common_Entity_Assignment').set({ egcs_cn_isprimary: true }).where('egcs_cn_entitytype', '=', target.entityType).where('egcs_cn_entityid', '=', target.entityId).where('egcs_cn_user', '=', body.userId).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
    }, { assigneeUserId: body.userId })
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 403) {
      return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    }
    throw error
  }
})
