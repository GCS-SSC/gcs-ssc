import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { requireAuthContext } from '~~/server/utils/authorize'
import { DataCollectionDefinitionInvalidError, fetchRuntimeDataCollection } from '~~/server/utils/data-collection-runtime'
import { canAccessCreditMemoTargetScopes } from '~~/server/utils/credit-memo-scope-authority'
import { resolveAssignedItemGrant } from '~~/server/utils/rbac'
import {
  canManageEntityAssignments,
  canReadEntityAssignments,
  canAccessEntityAssignmentOwner,
  resolveAgencyValidEntityAssigneeIdsWithDb,
  resolveAssignmentActor,
  resolveEntityAssignmentOwner
} from '~~/server/utils/entity-assignment'
import {
  authorizeReviewRuntimeAction,
  canAuthorizeReviewRuntimeAction,
  getReviewRuntimeOwnerAgencyId,
  isReviewRuntimeEntityWorkable,
  resolveReviewRuntimeEntityFromDataCollection
} from '~~/server/utils/review-runtime-access'
import { isActiveGroupMember } from '~~/server/utils/groups'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'dataCollectionId') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const context = await resolveReviewRuntimeEntityFromDataCollection(event.context.$db, id)
  if (!context) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorizeReviewRuntimeAction(event, 'read_assessment', context)
  let collection
  try {
    collection = await fetchRuntimeDataCollection(event.context.$db, id)
  } catch (error) {
    if (!(error instanceof DataCollectionDefinitionInvalidError)) throw error
    return await throwApiError(event, { statusCode: 409, code: 'DATA_COLLECTION_DEFINITION_INVALID', key: 'apiErrors.data_collection.definition_invalid' })
  }
  if (!collection) return await notFound(event, 'DATA_COLLECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const actor = await resolveAssignmentActor(event)
  const owner = await resolveEntityAssignmentOwner(event.context.$db, 'commondatacollection', id)
  const canUpdateRole = owner !== null
    && await canAccessEntityAssignmentOwner(actor.auth, owner, 'update', event.context.$db)
    && await canAccessCreditMemoTargetScopes(event.context.$db, actor.auth, 'commondatacollection', id, 'update')
  const grant = await resolveAssignedItemGrant(actor.auth.userId, 'commondatacollection', id, event.context.$db)
  const workable = await isReviewRuntimeEntityWorkable(event.context.$db, context)
  const active = collection.runtimeState === 'active' && collection.rootRuntimeState === 'active' && workable
  const group = collection.egcs_cn_group
    ? await event.context.$db.selectFrom('Common_Group').select('egcs_cn_agency')
        .where('id', '=', String(collection.egcs_cn_group)).where('_deleted', '=', false).executeTakeFirst()
    : null
  const matchesAgency = group && String(group.egcs_cn_agency) === getReviewRuntimeOwnerAgencyId(context)
  const canClaim = active && Boolean(matchesAgency) && Boolean(collection.egcs_cn_group)
    && !collection.egcs_cn_groupclaimedby && Boolean(actor.commonUserId)
    && await isActiveGroupMember(event.context.$db, String(collection.egcs_cn_group), actor.commonUserId!)
    && (await resolveAgencyValidEntityAssigneeIdsWithDb(event.context.$db, 'commondatacollection', id, [actor.commonUserId!])).has(actor.commonUserId!)
  const approval = await event.context.$db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item as Routing_Item', 'Routing_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .select(['Common_Routing_Slip.id as routingSlipId', 'Routing_Item.egcs_cn_runtime as approvalRuntimeId', 'Routing_Item.egcs_cn_state as approvalRuntimeState'])
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', 'commondatacollection')
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', id).where('Routing_Item.egcs_cn_parentruntimeitem', '=', collection.runtimeItemId)
    .where('Common_Routing_Slip._deleted', '=', false).where('Routing_Item._deleted', '=', false)
    .orderBy('Common_Routing_Slip.id', 'desc').executeTakeFirst()
  return {
    ...collection, can_read: true, can_claim: canClaim,
    can_update_role: canUpdateRole,
    can_update: active && await canAuthorizeReviewRuntimeAction(event, 'save_assessment', context),
    can_manage_assignments: active && await canManageEntityAssignments(event, 'commondatacollection', id),
    can_read_assignments: await canReadEntityAssignments(event, 'commondatacollection', id),
    is_assigned: grant !== null, is_primary: grant?.isPrimary === true,
    approvalRuntimeId: approval ? String(approval.approvalRuntimeId) : null,
    approvalRuntimeState: approval?.approvalRuntimeState ?? null,
    routingSlipId: approval ? String(approval.routingSlipId) : null
  }
})
