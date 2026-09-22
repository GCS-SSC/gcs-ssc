import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { authorize } from '~~/server/utils/authorize'
import { notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  const setupId = getRouterParam(event, 'reviewSetupId') ?? ''
  const stream = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!stream) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorize(event, 'transfer_payment', 'update', createTransferPaymentScopedAuthorizeHandler('update', stream.scope, event.context.$db))
  const setup = await event.context.$db.selectFrom('Common_Review_Set_Setup').select('id')
    .where('id', '=', setupId).where('egcs_cn_scopeid', '=', streamId).where('_deleted', '=', false).executeTakeFirst()
  if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const groups = await event.context.$db.selectFrom('Common_Group')
    .select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .where('egcs_cn_agency', '=', stream.agencyId).where('_deleted', '=', false)
    .orderBy('egcs_cn_name_en').execute()
  return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
})
