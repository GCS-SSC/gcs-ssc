import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { authorizeTransferPaymentStreamAction } from '~~/server/utils/transfer-payment-assessment-sets'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')

  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'read', streamContext, db)

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Common_Review_Set_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Review_Set_Setup.egcs_cn_scopeid')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
    .where('Common_Review_Set_Setup._deleted', '=', false)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Review_Set_Setup.egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Review_Set_Setup.egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .selectAll('Common_Review_Set_Setup')
      .select([
        'Common_Publication.egcs_cn_state as publicationState',
        'Common_Publication.egcs_cn_currentversion as publicationVersionId',
        'Common_Publication_Version.egcs_cn_version as publicationVersion'
      ])
      .orderBy('Common_Review_Set_Setup.egcs_cn_order', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => [
        eb.fn.count('Common_Review_Set_Setup.id').as('total'),
        eb.fn.count('Common_Review_Set_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')
      ])
      .executeTakeFirst()
  ])

  const setIds = items.map(item => String(item.id))
  const counts = setIds.length === 0
    ? []
    : await db
        .selectFrom('Common_Review_Setup')
        .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Review_Setup.egcs_cn_reviewset')
        .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Review_Set_Setup.egcs_cn_scopeid')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
        .select('Common_Review_Setup.egcs_cn_reviewset as reviewset')
        .where('Common_Review_Setup.egcs_cn_reviewset', 'in', setIds)
        .where('Common_Review_Setup._deleted', '=', false)
        .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
        .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
        .where('Common_Review_Set_Setup._deleted', '=', false)
        .where('Common_Review_Schema._deleted', '=', false)
        .where('Common_Review_Schema.egcs_cn_reviewtype', '=', 'assessment')
        .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .where('Agency_Profile._deleted', '=', false)
        .execute()

  const countsBySetId = counts.reduce<Map<string, number>>((acc, item) => {
    const key = String(item.reviewset)
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map<string, number>())
  const total = Number(countResult?.total ?? 0)
  const published = Number(countResult?.published ?? 0)

  return {
    items: items.map(item => ({
      id: String(item.id),
      egcs_cn_entitytype: item.egcs_cn_entitytype,
      egcs_cn_name_en: item.egcs_cn_name_en,
      egcs_cn_name_fr: item.egcs_cn_name_fr,
      egcs_cn_order: item.egcs_cn_order,
      egcs_cn_sequential: item.egcs_cn_sequential,
      egcs_cn_approvaltemplate: item.egcs_cn_approvaltemplate ? String(item.egcs_cn_approvaltemplate) : undefined,
      _deleted: item._deleted,
      assessment_count: countsBySetId.get(String(item.id)) ?? 0,
      publicationId: String(item.id),
      publicationState: item.publicationState,
      publicationVersionId: item.publicationVersionId === null ? null : String(item.publicationVersionId),
      publicationVersion: item.publicationVersion === null ? null : Number(item.publicationVersion),
      hasUnpublishedChanges: item.publicationState === 'draft'
    })),
    total,
    stats: { total, published },
    page,
    limit
  }
})
