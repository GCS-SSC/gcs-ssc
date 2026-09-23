/* eslint-disable jsdoc/require-jsdoc */
import type { H3Event } from 'h3'
import { z } from 'zod'
import { authorize } from './authorize'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n } from './api-validate'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { authorizeTransferPaymentStreamResource, createTransferPaymentScopedAuthorizeHandler } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamRead, executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const LinkBodySchema = z.object({
  egcs_tp_reviewset: z.union([z.string(), z.number()]).transform(String)
}).strict()

type LinkAction = 'read' | 'create' | 'delete'

export const streamReviewSetRoute = async (event: H3Event, action: LinkAction) => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')

  // Link removal is a Contributor operation, like other Stream configuration edits.
  const accessAction = action === 'read' ? 'read' : 'update'
  const stream = await authorizeTransferPaymentStreamResource(event, accessAction, profileId, streamId)
  if (!stream) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', accessAction, createTransferPaymentScopedAuthorizeHandler(accessAction, stream.scope, db))

  if (action === 'read') {
    return await executeFreshAuthorizedTransferPaymentStreamRead(event, db, profileId, stream.agencyId, streamId, async (trx, fresh) => {
      const items = await trx.selectFrom('Transfer_Payment_Stream_Review_Set')
        .innerJoin('Common_Review_Set_Setup', 'Common_Review_Set_Setup.id', 'Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset')
        .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
        .select([
          'Transfer_Payment_Stream_Review_Set.id',
          'Transfer_Payment_Stream_Review_Set.egcs_tp_reviewset',
          'Common_Review_Set_Setup.egcs_cn_name_en',
          'Common_Review_Set_Setup.egcs_cn_name_fr',
          'Common_Review_Set_Setup.egcs_cn_entitytype',
          'Common_Review_Set_Setup.egcs_cn_directreview',
          'Common_Publication.egcs_cn_state as publicationState'
        ])
        .where('Transfer_Payment_Stream_Review_Set.egcs_tp_transferpaymentstream', '=', streamId)
        .where('Transfer_Payment_Stream_Review_Set._deleted', '=', false)
        .where('Common_Review_Set_Setup.egcs_cn_agency', '=', fresh.agencyId)
        .orderBy('Common_Review_Set_Setup.egcs_cn_name_en')
        .execute()
      return { items: items.map(item => ({ ...item, id: String(item.id), egcs_tp_reviewset: String(item.egcs_tp_reviewset) })) }
    })
  }

  if (action === 'create') {
    const body = await readValidatedBodyI18n(event, LinkBodySchema)
    if (!isPositivePostgresBigintText(body.egcs_tp_reviewset)) {
      return await badRequest(event, 'REVIEW_SETUP_NOT_FOUND', 'apiErrors.transfer_payment.review_setup_not_found')
    }
    try {
      return await executeFreshAuthorizedTransferPaymentStreamWrite(
        event, db, profileId, stream.agencyId, streamId, 'update', async (trx, fresh) => {
          const setup = await trx.selectFrom('Common_Review_Set_Setup')
            .innerJoin('Common_Publication', 'Common_Publication.id', 'Common_Review_Set_Setup.id')
            .select('Common_Review_Set_Setup.id')
            .where('Common_Review_Set_Setup.id', '=', body.egcs_tp_reviewset)
            .where('Common_Review_Set_Setup.egcs_cn_agency', '=', fresh.agencyId)
            .where('Common_Review_Set_Setup._deleted', '=', false)
            .where('Common_Publication._deleted', '=', false)
            .where('Common_Publication.egcs_cn_state', '=', 'published')
            .forUpdate(['Common_Review_Set_Setup', 'Common_Publication'])
            .executeTakeFirst()
          if (!setup) return await badRequest(event, 'REVIEW_SETUP_NOT_PUBLISHED', 'apiErrors.request.invalid_resource')
          const existing = await trx.selectFrom('Transfer_Payment_Stream_Review_Set')
            .select('id').where('egcs_tp_transferpaymentstream', '=', streamId)
            .where('egcs_tp_reviewset', '=', body.egcs_tp_reviewset).where('_deleted', '=', false)
            .forUpdate().executeTakeFirst()
          if (existing) return await throwApiError(event, { statusCode: 409, code: 'REVIEW_SET_LINK_EXISTS', key: 'apiErrors.request.invalid_resource' })
          const inserted = await trx.insertInto('Transfer_Payment_Stream_Review_Set')
            .values({ egcs_tp_transferpaymentstream: streamId, egcs_tp_reviewset: body.egcs_tp_reviewset, _deleted: false })
            .returning(['id', 'egcs_tp_reviewset']).executeTakeFirstOrThrow()
          return { id: String(inserted.id), egcs_tp_reviewset: String(inserted.egcs_tp_reviewset) }
        }
      )
    } catch (error: unknown) {
      if (getDatabaseConstraintName(error)?.includes('review_set')) {
        return await throwApiError(event, { statusCode: 409, code: 'REVIEW_SET_LINK_EXISTS', key: 'apiErrors.request.invalid_resource' })
      }
      throw error
    }
  }

  const linkId = getRouterParam(event, 'linkId') ?? ''
  if (!isPositivePostgresBigintText(linkId)) return await notFound(event, 'REVIEW_SET_LINK_NOT_FOUND', 'apiErrors.request.not_found')
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, stream.agencyId, streamId, 'update', async trx => {
      const link = await trx.selectFrom('Transfer_Payment_Stream_Review_Set').select('id')
        .where('id', '=', linkId).where('egcs_tp_transferpaymentstream', '=', streamId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!link) return await notFound(event, 'REVIEW_SET_LINK_NOT_FOUND', 'apiErrors.request.not_found')
      await trx.updateTable('Transfer_Payment_Stream_Review_Set').set({ _deleted: true }).where('id', '=', linkId).execute()
      return { success: true }
    }
  )
}
