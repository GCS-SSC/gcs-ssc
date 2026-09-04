import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { resolveAssignmentActor } from '~~/server/utils/entity-assignment'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { EntityAssignmentCreateSchema, EntityAssignmentTargetSchema } from '~~/shared/types/schemas'
import { parseI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const target = await parseI18n(event, EntityAssignmentTargetSchema, { entityType: getRouterParam(event, 'entityType'), entityId: getRouterParam(event, 'entityId') })
  const body = await readValidatedBodyI18n(event, EntityAssignmentCreateSchema)
  const actor = await resolveAssignmentActor(event)
  try {
    return await executeEntityAssignmentManagement(event, target, async trx => {
      const duplicate = await trx.selectFrom('Common_Entity_Assignment').select('id')
        .where('egcs_cn_entityid', '=', target.entityId)
        .where('egcs_cn_entitytype', '=', target.entityType)
        .where('egcs_cn_user', '=', body.userId)
        .where('_deleted', '=', false)
        .executeTakeFirst()
      if (duplicate) {
        return await throwApiError(event, {
          statusCode: 409,
          code: 'ASSIGNMENT_DUPLICATE_USER',
          key: 'apiErrors.assignments.duplicate_user'
        })
      }
      return await trx.insertInto('Common_Entity_Assignment').values({
        egcs_cn_entityid: target.entityId, egcs_cn_entitytype: target.entityType, egcs_cn_user: body.userId, egcs_cn_createdby: actor.commonUserId
      }).returningAll().executeTakeFirstOrThrow()
    }, { assigneeUserId: body.userId })
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 403) {
      return await notFound(event, 'ASSIGNMENT_TARGET_NOT_FOUND', 'apiErrors.request.not_found')
    }
    throw error
  }
})
