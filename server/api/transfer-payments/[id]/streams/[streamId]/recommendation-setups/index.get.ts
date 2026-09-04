import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import {
  readRecommendationSchemaPublicationMetadata,
  readRecommendationSetupPublicationMetadata
} from '~~/server/utils/recommendation-setup-versioning'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    let baseQuery = trx.selectFrom('Common_Recommendation_Set_Setup')
      .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Recommendation_Set_Setup.id')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Recommendation_Set_Setup.egcs_cn_scopeid')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('Common_Recommendation_Set_Setup.egcs_cn_scopeid', '=', streamId)
      .where('Common_Recommendation_Set_Setup._deleted', '=', false)
      .where('Common_Publication._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Transfer_Payment_Profile.egcs_tp_agency', '=', streamContext.agencyId)
    if (search) {
      const value = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        eb('Common_Recommendation_Set_Setup.egcs_cn_name_en', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_name_fr', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_description_en', 'ilike', `%${value}%`),
        eb('Common_Recommendation_Set_Setup.egcs_cn_description_fr', 'ilike', `%${value}%`)
      ]))
    }
    const [setups, count] = await Promise.all([
      baseQuery.selectAll('Common_Recommendation_Set_Setup').orderBy('Common_Recommendation_Set_Setup.id', 'asc').limit(limit).offset(offset).execute(),
      baseQuery.select(eb => [
        eb.fn.count('Common_Recommendation_Set_Setup.id').as('total'),
        eb.fn.count('Common_Recommendation_Set_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')
      ]).executeTakeFirst()
    ])
    const setupIds = setups.map(setup => String(setup.id))
    const members = setupIds.length === 0
      ? []
      : await trx.selectFrom('Common_Recommendation_Setup')
          .innerJoin('Common_Recommendation_Schema', 'Common_Recommendation_Schema.id', 'Common_Recommendation_Setup.egcs_cn_recommendationschema')
          .select([
            'Common_Recommendation_Setup.id', 'Common_Recommendation_Setup.egcs_cn_recommendationset',
            'Common_Recommendation_Setup.egcs_cn_recommendationschema', 'Common_Recommendation_Setup.egcs_cn_order',
            'Common_Recommendation_Setup.egcs_cn_approvaltemplate', 'Common_Recommendation_Setup._deleted',
            'Common_Recommendation_Setup.egcs_cn_failonnotrecommended',
            'Common_Recommendation_Schema.egcs_cn_name_en', 'Common_Recommendation_Schema.egcs_cn_name_fr'
          ])
          .where('Common_Recommendation_Setup.egcs_cn_recommendationset', 'in', setupIds)
          .where('Common_Recommendation_Setup._deleted', '=', false)
          .where('Common_Recommendation_Schema._deleted', '=', false)
          .orderBy('Common_Recommendation_Setup.egcs_cn_order', 'asc').execute()
    const membersBySetup = new Map<string, typeof members>()
    for (const member of members) {
      const key = String(member.egcs_cn_recommendationset)
      membersBySetup.set(key, [...(membersBySetup.get(key) ?? []), member])
    }
    const total = Number(count?.total ?? 0)
    return {
      items: await Promise.all(setups.map(async setup => ({
        ...setup,
        id: String(setup.id),
        egcs_cn_scopeid: String(setup.egcs_cn_scopeid),
        egcs_cn_approvaltemplate: setup.egcs_cn_approvaltemplate ? String(setup.egcs_cn_approvaltemplate) : undefined,
        ...await readRecommendationSetupPublicationMetadata(trx, setup),
        members: await Promise.all((membersBySetup.get(String(setup.id)) ?? []).map(async member => ({
          ...member,
          id: String(member.id),
          egcs_cn_recommendationset: String(member.egcs_cn_recommendationset),
          egcs_cn_recommendationschema: String(member.egcs_cn_recommendationschema),
          egcs_cn_approvaltemplate: member.egcs_cn_approvaltemplate ? String(member.egcs_cn_approvaltemplate) : undefined,
          ...await readRecommendationSchemaPublicationMetadata(trx, String(member.egcs_cn_recommendationschema))
        })))
      }))),
      total,
      stats: { total, published: Number(count?.published ?? 0) },
      page,
      limit
    }
  })
})
