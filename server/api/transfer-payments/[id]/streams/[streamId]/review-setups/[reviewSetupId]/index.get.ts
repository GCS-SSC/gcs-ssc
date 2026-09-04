import { authorize } from '~~/server/utils/authorize'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { mapReviewSetupMembers } from '~~/server/utils/transfer-payment-polymorphic'
import { readReviewSetupPublicationMetadata } from '~~/server/utils/review-setup-versioning'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const reviewSetupId = getRouterParam(event, 'reviewSetupId')
  if (!profileId || !streamId || !reviewSetupId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(reviewSetupId)) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'read', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope, db))

  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const setup = await trx.selectFrom('Common_Review_Set_Setup')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Review_Set_Setup.egcs_cn_scopeid')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
      .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Review_Set_Setup.egcs_cn_entitytype')
      .selectAll('Common_Review_Set_Setup')
      .select([
        'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
        'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr'
      ])
      .where('Common_Review_Set_Setup.id', '=', reviewSetupId)
      .where('Common_Review_Set_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
      .where('Common_Review_Set_Setup.egcs_cn_scopeid', '=', streamId)
      .where('Common_Review_Set_Setup._deleted', '=', false)
      .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .executeTakeFirst()
    if (!setup) return await notFound(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')

    const members = await trx.selectFrom('Common_Review_Setup')
      .innerJoin('Common_Review_Schema', 'Common_Review_Schema.id', 'Common_Review_Setup.egcs_cn_reviewschema')
      .innerJoin('Common_Publication as Review_Schema_Publication', 'Review_Schema_Publication.id', 'Common_Review_Schema.id')
      .leftJoin('Common_Publication_Version as Review_Schema_Version', 'Review_Schema_Version.id', 'Review_Schema_Publication.egcs_cn_currentversion')
      .select([
        'Common_Review_Setup.id as id',
        'Common_Review_Setup.egcs_cn_reviewset as egcs_cn_reviewset',
        'Common_Review_Setup.egcs_cn_reviewschema as egcs_cn_reviewschema',
        'Common_Review_Setup.egcs_cn_order as egcs_cn_order',
        'Common_Review_Setup.egcs_cn_approvaltemplate as egcs_cn_approvaltemplate',
        'Common_Review_Setup.egcs_cn_failonchecklistfailure as egcs_cn_failonchecklistfailure',
        'Common_Review_Setup.egcs_cn_failurethreshold as egcs_cn_failurethreshold',
        'Common_Review_Schema.egcs_cn_name_en as egcs_cn_name_en',
        'Common_Review_Schema.egcs_cn_name_fr as egcs_cn_name_fr',
        'Common_Review_Schema.egcs_cn_outcomename_en as egcs_cn_outcomename_en',
        'Common_Review_Schema.egcs_cn_outcomename_fr as egcs_cn_outcomename_fr',
        'Common_Review_Schema.egcs_cn_disablecustomoutcomes as egcs_cn_disablecustomoutcomes',
        'Common_Review_Schema.egcs_cn_disablealignment as egcs_cn_disablealignment',
        'Common_Review_Schema.egcs_cn_disablereviewers as egcs_cn_disablereviewers',
        'Review_Schema_Publication.id as publicationId',
        'Review_Schema_Publication.egcs_cn_state as publicationState',
        'Review_Schema_Publication.egcs_cn_currentversion as publicationVersionId',
        'Review_Schema_Version.egcs_cn_version as publicationVersion',
        'Common_Review_Schema.egcs_cn_reviewtype as egcs_cn_reviewtype',
        'Common_Review_Setup._deleted as _deleted'
      ])
      .where('Common_Review_Setup.egcs_cn_reviewset', '=', reviewSetupId)
      .where('Common_Review_Setup._deleted', '=', false)
      .where('Common_Review_Schema._deleted', '=', false)
      .orderBy('Common_Review_Setup.egcs_cn_order', 'asc')
      .execute()

    return {
      ...setup,
      members: mapReviewSetupMembers(members),
      ...await readReviewSetupPublicationMetadata(trx, setup)
    }
  })
})
