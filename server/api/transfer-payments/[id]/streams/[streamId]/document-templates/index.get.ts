import type { Scope } from '~~/shared/utils/scopes'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { resolveTransferPaymentAgreementSubtypeStreamScopeContext } from '~~/server/utils/transfer-payment-agreement-subtypes'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const transferPaymentId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!transferPaymentId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }
  if (!isPositivePostgresBigintText(transferPaymentId) || !isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  const streamContext = await resolveTransferPaymentAgreementSubtypeStreamScopeContext(transferPaymentId, streamId, db)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorize(event, 'transfer_payment', 'read', createTransferPaymentScopedAuthorizeHandler('read', streamContext.scope as Scope, db))

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  let baseQuery = db
    .selectFrom('Transfer_Payment_Stream_Document_Template')
    .innerJoin('Common_Attachment as AttachmentEn', 'AttachmentEn.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_en')
    .innerJoin('Common_Attachment as AttachmentFr', 'AttachmentFr.id', 'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_fr')
    .where('Transfer_Payment_Stream_Document_Template.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Document_Template._deleted', '=', false)
    .where('AttachmentEn._deleted', '=', false)
    .where('AttachmentFr._deleted', '=', false)

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Transfer_Payment_Stream_Document_Template.egcs_tp_name_en', 'ilike', pattern),
      eb('Transfer_Payment_Stream_Document_Template.egcs_tp_name_fr', 'ilike', pattern)
    ]))
  }

  const [items, countResult, activeResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Stream_Document_Template.id as id',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_transferpaymentstream as egcs_tp_transferpaymentstream',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_entitytype as egcs_tp_entitytype',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_name_en as egcs_tp_name_en',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_name_fr as egcs_tp_name_fr',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_description_en as egcs_tp_description_en',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_description_fr as egcs_tp_description_fr',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_en as egcs_tp_templateattachment_en',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_templateattachment_fr as egcs_tp_templateattachment_fr',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_templatekind as egcs_tp_templatekind',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_outputformats as egcs_tp_outputformats',
        'Transfer_Payment_Stream_Document_Template.egcs_tp_active as egcs_tp_active',
        'AttachmentEn.egcs_cn_name_en as attachment_en_name_en',
        'AttachmentEn.egcs_cn_name_fr as attachment_en_name_fr',
        'AttachmentEn.egcs_cn_mimetype as attachment_en_mimetype',
        'AttachmentEn.egcs_cn_filesize as attachment_en_filesize',
        'AttachmentFr.egcs_cn_name_en as attachment_fr_name_en',
        'AttachmentFr.egcs_cn_name_fr as attachment_fr_name_fr',
        'AttachmentFr.egcs_cn_mimetype as attachment_fr_mimetype',
        'AttachmentFr.egcs_cn_filesize as attachment_fr_filesize'
      ])
      .orderBy('Transfer_Payment_Stream_Document_Template.egcs_tp_entitytype', 'asc')
      .orderBy('Transfer_Payment_Stream_Document_Template.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Stream_Document_Template.id').as('total')).executeTakeFirst(),
    baseQuery
      .where('Transfer_Payment_Stream_Document_Template.egcs_tp_active', '=', true)
      .select(eb => eb.fn.count('Transfer_Payment_Stream_Document_Template.id').as('active'))
      .executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)
  return {
    items,
    total,
    stats: {
      total,
      active: Number(activeResult?.active || 0)
    },
    page,
    limit
  }
})
