import { authorize } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { buildReviewSetupPublication } from '~~/server/utils/review-setup-versioning'
import { isExpectedPublicationFailure } from '~~/server/utils/publication-errors'
import { publishDefinition } from '~~/server/utils/system-publication'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { isAssignableGroup } from '~~/server/utils/groups'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const setupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(setupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Review_Set_Setup').selectAll().where('id', '=', setupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const plan = await buildReviewSetupPublication(trx, setup).catch((error: unknown) => {
      if (isExpectedPublicationFailure(error)) return null
      throw error
    })
    if (!plan) return await badRequest(event, 'REVIEW_SETUP_INVALID_PUBLICATION', 'apiErrors.request.invalid_resource')
    for (const member of plan.definition.members) {
      if (member.defaultGroupId && !await isAssignableGroup(trx, member.defaultGroupId, agencyId)) {
        return await badRequest(event, 'REVIEW_SETUP_GROUP_INVALID', 'apiErrors.request.invalid')
      }
    }
    return await publishDefinition(trx, {
      publicationId: setupId,
      kind: 'review_set_setup',
      definition: plan.definition,
      references: plan.references,
      actorId: actor.id
    })
  }
  )
})
