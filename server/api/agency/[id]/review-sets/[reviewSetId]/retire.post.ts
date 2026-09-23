import { authorize } from '~~/server/utils/authorize'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { retirePublication } from '~~/server/utils/system-publication'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const setupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  if (!isPositivePostgresBigintText(setupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Review_Set_Setup').select('id').where('id', '=', setupId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
    const actor = await resolveCurrentCommonUser(event, trx)
    if (!actor) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return await retirePublication(trx, { publicationId: setupId, kind: 'review_set_setup', actorId: actor.id })
  }
  )
})
