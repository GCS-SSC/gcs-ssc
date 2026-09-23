/* eslint-disable jsdoc/require-jsdoc -- Stream-owned section configuration adapter. */
import { getRouterParam, type H3Event } from 'h3'
import { authorize } from './authorize'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n, parseI18n } from './api-validate'
import { StreamFieldSectionCreateSchema, StreamFieldSectionPatchSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const streamCustomFieldSectionRoute = async (event: H3Event, operation: 'create' | 'update' | 'delete') => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const sectionId = getRouterParam(event, 'sectionId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!context) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', 'update', context.scope)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'update', async trx => {
    if (operation === 'create') {
      const body = await readValidatedBodyI18n(event, StreamFieldSectionCreateSchema)
      return await trx.insertInto('Transfer_Payment_Stream_Field_Section')
        .values({ ...body, egcs_tp_transferpaymentstream: streamId })
        .returningAll().executeTakeFirstOrThrow()
    }
    if (!sectionId || !isPositivePostgresBigintText(sectionId)) {
      return await notFound(event, 'SECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    }
    const section = await trx.selectFrom('Transfer_Payment_Stream_Field_Section').selectAll()
      .where('id', '=', sectionId).where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!section) return await notFound(event, 'SECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (operation === 'delete') {
      const assignment = await trx.selectFrom('Transfer_Payment_Stream_Field_Assignment').select('id')
        .where('egcs_tp_section', '=', sectionId).where('_deleted', '=', false).executeTakeFirst()
      if (assignment) return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_SECTION_IN_USE', key: 'apiErrors.custom_fields.section_in_use' })
      return await trx.updateTable('Transfer_Payment_Stream_Field_Section').set({ _deleted: true })
        .where('id', '=', sectionId).returningAll().executeTakeFirstOrThrow()
    }
    const patch = await readValidatedBodyI18n(event, StreamFieldSectionPatchSchema)
    const merged = await parseI18n(event, StreamFieldSectionCreateSchema, { ...section, ...patch })
    return await trx.updateTable('Transfer_Payment_Stream_Field_Section').set(merged)
      .where('id', '=', sectionId).returningAll().executeTakeFirstOrThrow()
  })
}
