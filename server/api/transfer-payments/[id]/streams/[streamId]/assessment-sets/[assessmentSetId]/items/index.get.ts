import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  fetchAssessmentSetForStream
} from '~~/server/utils/transfer-payment-assessment-sets'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const assessmentSetId = getRouterParam(event, 'assessmentSetId')

  if (!profileId || !streamId || !assessmentSetId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'read', streamContext, db)

  const parentSet = await fetchAssessmentSetForStream(db, streamId, assessmentSetId)
  if (!parentSet) {
    return await notFound(event, 'ASSESSMENT_SET_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
  }

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Review_Setup.egcs_cn_reviewset')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Schema.id')
    .leftJoin('Common_Publication_Version', 'Common_Publication_Version.id', 'Common_Publication.egcs_cn_currentversion')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Review_Set_Setup.egcs_cn_scopeid')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select([
      'Common_Review_Setup.id as id',
      'Common_Review_Setup.egcs_cn_order as egcs_cn_order',
      'Common_Review_Setup.egcs_cn_approvaltemplate as egcs_cn_approvaltemplate',
      'Common_Review_Setup.egcs_cn_reviewschema as egcs_cn_reviewschema',
      'Common_Review_Setup._deleted as _deleted',
      'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
      'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
      'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
      'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
      'Common_Publication.egcs_cn_state as publicationState',
      'Common_Publication.egcs_cn_currentversion as publicationVersionId',
      'Common_Publication_Version.egcs_cn_version as publicationVersion'
    ])
    .where('Common_Review_Setup.egcs_cn_reviewset', '=', assessmentSetId)
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

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Review_Schema.egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Review_Schema.egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  let countQuery = db
    .selectFrom('Common_Review_Setup')
    .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Common_Review_Setup.egcs_cn_reviewset')
    .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Review_Set_Setup.egcs_cn_scopeid')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .select(eb => eb.fn.count('Common_Review_Setup.id').as('total'))
    .where('Common_Review_Setup.egcs_cn_reviewset', '=', assessmentSetId)
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

  if (search) {
    const escapedSearch = escapeLikePattern(String(search))
    countQuery = countQuery.where(eb => eb.or([
      eb('Common_Review_Schema.egcs_cn_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Review_Schema.egcs_cn_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    countQuery.executeTakeFirst()
  ])

  return {
    items: items.map(item => ({
      id: String(item.id),
      egcs_cn_order: item.egcs_cn_order,
      egcs_cn_approvaltemplate: item.egcs_cn_approvaltemplate ? String(item.egcs_cn_approvaltemplate) : undefined,
      egcs_cn_reviewschema: String(item.egcs_cn_reviewschema),
      egcs_cn_name_en: item.egcs_cn_name_en,
      egcs_cn_name_fr: item.egcs_cn_name_fr,
      egcs_cn_outcomename_en: item.egcs_cn_outcomename_en,
      egcs_cn_outcomename_fr: item.egcs_cn_outcomename_fr,
      publicationId: String(item.egcs_cn_reviewschema),
      publicationState: item.publicationState,
      publicationVersionId: item.publicationVersionId === null ? null : String(item.publicationVersionId),
      publicationVersion: item.publicationVersion === null ? null : Number(item.publicationVersion)
    })),
    total: Number(countResult?.total ?? 0),
    page,
    limit
  }
})
