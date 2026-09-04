import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import {
  readRecommendationSchemaPublicationMetadata,
  readRecommendationSetupPublicationMetadata
} from '~~/server/utils/recommendation-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const setupId = getRouterParam(event, 'recommendationSetupId')
  if (!profileId || !streamId || !setupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(setupId)) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.recommendation_setup_not_found')
  const context = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!context) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', context.scope, db))

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const setup = await trx.selectFrom('Common_Recommendation_Set_Setup')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Recommendation_Set_Setup.egcs_cn_scopeid')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .selectAll('Common_Recommendation_Set_Setup')
      .where('Common_Recommendation_Set_Setup.id', '=', setupId)
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopeid', '=', streamId)
      .where('Common_Recommendation_Set_Setup._deleted', '=', false)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .executeTakeFirst()
    if (!setup) return await notFound(event, 'RECOMMENDATION_SETUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const members = await trx.selectFrom('Common_Recommendation_Setup')
      .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema')
      .select([
        'Common_Recommendation_Setup.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema',
        'Common_Recommendation_Setup.egcs_cn_order', 'Common_Recommendation_Setup.egcs_cn_approvaltemplate',
        'Common_Recommendation_Setup.egcs_cn_failonnotrecommended',
        'Common_Recommendation_Schema.egcs_cn_name_en', 'Common_Recommendation_Schema.egcs_cn_name_fr'
      ])
      .where('Common_Recommendation_Setup.egcs_cn_recommendationset', '=', setupId)
      .where('Common_Recommendation_Setup._deleted', '=', false)
      .where('Common_Recommendation_Schema._deleted', '=', false)
      .orderBy('Common_Recommendation_Setup.egcs_cn_order', 'asc').execute()
    const metadata = await readRecommendationSetupPublicationMetadata(trx, setup)
    return {
      ...setup,
      id: String(setup.id),
      egcs_cn_scopeid: String(setup.egcs_cn_scopeid),
      egcs_cn_approvaltemplate: setup.egcs_cn_approvaltemplate ? String(setup.egcs_cn_approvaltemplate) : undefined,
      ...metadata,
      members: await Promise.all(members.map(async member => ({
        ...member,
        id: String(member.id),
        egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema),
        ...(member.egcs_cn_approvaltemplate ? { egcs_cn_approvaltemplate: String(member.egcs_cn_approvaltemplate) } : {}),
        ...await readRecommendationSchemaPublicationMetadata(trx, String(member.egcs_cn_recommendationschema))
      })))
    }
  })
})
