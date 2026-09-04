import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { readPublicationMetadataBatch } from '~~/server/utils/system-publication'

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
  let baseQuery = db.selectFrom('Common_Workflow_Setup')
    .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Workflow_Setup.id')
    .innerJoin('Common_Entity_Type', 'Common_Entity_Type.egcs_cn_type', 'Common_Workflow_Setup.egcs_cn_entitytype')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Workflow_Setup.egcs_cn_scopeid')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Common_Workflow_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
    .where('Common_Workflow_Setup.egcs_cn_scopeid', '=', streamId).where('Common_Workflow_Setup._deleted', '=', false)
    .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
    .where('Common_Publication._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
  if (search) {
    const value = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Workflow_Setup.egcs_cn_name_en', 'ilike', `%${value}%`), eb('Common_Workflow_Setup.egcs_cn_name_fr', 'ilike', `%${value}%`),
      eb('Common_Workflow_Setup.egcs_cn_description_en', 'ilike', `%${value}%`), eb('Common_Workflow_Setup.egcs_cn_description_fr', 'ilike', `%${value}%`)
    ]))
  }
  const [items, count] = await Promise.all([
    baseQuery.selectAll('Common_Workflow_Setup').select([
      'Common_Entity_Type.egcs_cn_label_en as entityTypeLabelEn',
      'Common_Entity_Type.egcs_cn_label_fr as entityTypeLabelFr'
    ]).orderBy('Common_Workflow_Setup.id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => [
      eb.fn.count('Common_Workflow_Setup.id').as('total'),
      eb.fn.count('Common_Workflow_Setup.id').filterWhere('Common_Publication.egcs_cn_state', '=', 'published').as('published')
    ]).executeTakeFirst()
  ])
  const setupIds = items.map(item => String(item.id))
  const allowedRows = setupIds.length === 0
    ? []
    : await db.selectFrom('Common_Workflow_Setup_Allowed_Start_Status')
        .innerJoin('Common_Workflow_Setup', 'Common_Workflow_Setup.id', 'Common_Workflow_Setup_Allowed_Start_Status.egcs_cn_workflowsetup')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Workflow_Setup.egcs_cn_scopeid')
        .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
        .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
        .select(['egcs_cn_workflowsetup', 'egcs_cn_status', 'egcs_cn_order'])
        .where('Common_Workflow_Setup_Allowed_Start_Status.egcs_cn_workflowsetup', 'in', setupIds)
        .where('Transfer_Payment_Stream.id', '=', streamId)
        .where('Transfer_Payment_Stream.egcs_tp_transferpaymentprofile', '=', profileId)
        .where('Common_Workflow_Setup_Allowed_Start_Status._deleted', '=', false)
        .where('Common_Workflow_Setup._deleted', '=', false)
        .where('Transfer_Payment_Stream._deleted', '=', false)
        .where('Transfer_Payment_Profile._deleted', '=', false)
        .where('Agency_Profile._deleted', '=', false)
        .orderBy('egcs_cn_order', 'asc').execute()
  // Building every nested working definition here recursively loads members, owners,
  // referenced publications, and statuses once per row. Collection reads instead use
  // one lifecycle batch and conservatively flag every non-retired setup as editable;
  // exact working-definition comparison remains available on the detail route.
  const publicationMetadata = await readPublicationMetadataBatch(db, items.map(item => ({
    publicationId: String(item.id)
  })))
  const total = Number(count?.total ?? 0)
  return {
    items: items.map((item) => {
      const metadata = publicationMetadata.get(String(item.id))!
      return {
        ...item,
        egcs_cn_scopeid: String(item.egcs_cn_scopeid),
        ...metadata,
        hasUnpublishedChanges: metadata.publicationState !== 'retired',
        egcs_cn_allowedstartstatuses: allowedRows
          .filter(row => String(row.egcs_cn_workflowsetup) === String(item.id))
          .map(row => String(row.egcs_cn_status))
      }
    }),
    total,
    stats: { total, published: Number(count?.published ?? 0) },
    page,
    limit
  }
})
