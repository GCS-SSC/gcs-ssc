import { forbidden, notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { resolveAgencyValidEntityAssigneeIdsWithDb } from '~~/server/utils/entity-assignment'
import { getReviewRuntimeOwnerAgencyId, executeFreshAuthorizedRuntimeGroupClaim, resolveReviewRuntimeEntityFromDataCollection } from '~~/server/utils/review-runtime-access'
import { lockActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'dataCollectionId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveReviewRuntimeEntityFromDataCollection(event.context.$db, id)
  if (!context) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeFreshAuthorizedRuntimeGroupClaim(event, context, async (trx, lockedContext) => {
    const fresh = await resolveReviewRuntimeEntityFromDataCollection(trx, id)
    if (!fresh || fresh.entityType !== context.entityType || fresh.entityId !== context.entityId) {
      return await throwApiError(event, { statusCode: 409, code: 'DATA_COLLECTION_OWNER_CHANGED', key: 'apiErrors.request.invalid_status' })
    }
    const collection = await trx.selectFrom('Common_Data_Collection')
      .innerJoin('Common_Runtime_Item as Collection_Item', 'Collection_Item.id', 'Common_Data_Collection.egcs_cn_runtimeitem')
      .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Collection_Item.egcs_cn_runtime')
      .select(['Common_Data_Collection.egcs_cn_group', 'Common_Data_Collection.egcs_cn_groupclaimedby',
        'Common_Runtime.egcs_cn_state as runtimeState', 'Collection_Item.egcs_cn_state as collectionState'])
      .where('Common_Data_Collection.id', '=', id).where('Common_Data_Collection._deleted', '=', false)
      .where('Collection_Item._deleted', '=', false).where('Common_Runtime._deleted', '=', false)
      .forUpdate(['Common_Runtime', 'Common_Data_Collection', 'Collection_Item']).executeTakeFirst()
    if (!collection) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (collection.runtimeState !== 'active' || collection.collectionState !== 'active') {
      return await throwApiError(event, { statusCode: 409, code: 'ASSIGNMENT_ROSTER_LOCKED', key: 'apiErrors.request.invalid_status' })
    }
    if (!collection.egcs_cn_group || collection.egcs_cn_groupclaimedby) {
      return await throwApiError(event, { statusCode: 409, code: 'GROUP_WORK_ALREADY_CLAIMED', key: 'apiErrors.request.invalid_status' })
    }
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor || !await lockActiveGroupMember(trx, String(collection.egcs_cn_group), actor.id)) return await forbidden(event)
    const agencyId = getReviewRuntimeOwnerAgencyId(lockedContext)
    const group = await trx.selectFrom('Common_Group').select('egcs_cn_agency')
      .where('id', '=', String(collection.egcs_cn_group)).where('_deleted', '=', false).executeTakeFirst()
    if (!agencyId || !group || String(group.egcs_cn_agency) !== agencyId) return await forbidden(event)
    const eligible = await resolveAgencyValidEntityAssigneeIdsWithDb(trx, 'commondatacollection', id, [actor.id])
    if (!eligible.has(actor.id)) return await forbidden(event)
    const assignments = await trx.selectFrom('Common_Entity_Assignment')
      .select(['id', 'egcs_cn_user']).where('egcs_cn_entitytype', '=', 'commondatacollection')
      .where('egcs_cn_entityid', '=', id).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
    if (!assignments.some(assignment => String(assignment.egcs_cn_user) === actor.id)) {
      await trx.insertInto('Common_Entity_Assignment').values({
        egcs_cn_entitytype: 'commondatacollection', egcs_cn_entityid: id, egcs_cn_user: actor.id,
        egcs_cn_isprimary: assignments.length === 0, egcs_cn_createdby: actor.id
      }).execute()
    }
    await trx.updateTable('Common_Data_Collection').set({ egcs_cn_groupclaimedby: actor.id }).where('id', '=', id).execute()
    return { id, egcs_cn_group: String(collection.egcs_cn_group), egcs_cn_groupclaimedby: actor.id }
  })
})
