import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  const setupId = getRouterParam(event, 'reviewSetId') ?? ''
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const setup = await trx.selectFrom('Common_Review_Set_Setup').select('id')
      .where('id', '=', setupId).where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const groups = await trx.selectFrom('Common_Group')
      .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
      .where('egcs_cn_agency', '=', agencyId).where('_deleted', '=', false)
      .orderBy('egcs_cn_name_en').execute()
    return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
  })
})
