import { customFieldHasWorkflowReferences } from './workflow-conditions'
/* eslint-disable jsdoc/require-jsdoc -- Stream-owned configuration adapters. */
import { getRouterParam, type H3Event } from 'h3'
import { authorize } from './authorize'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n, parseI18n } from './api-validate'
import { readAgreementCustomFieldDefinitions, readAgreementCustomFieldSections } from './agreement-custom-fields'
import { StreamFieldSectionCreateSchema, StreamFieldSectionPatchSchema, StreamFieldCreateSchema, StreamFieldPatchSchema, StreamFieldOptionCreateSchema, StreamFieldOptionPatchSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export const streamCustomFieldRoute = async (event: H3Event, operation: 'read' | 'create' | 'update' | 'delete', resource: 'field' | 'option' | 'section') => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const fieldId = getRouterParam(event, 'fieldId')
  const optionId = getRouterParam(event, 'optionId')
  const sectionId = getRouterParam(event, 'sectionId')
  if (!profileId || !streamId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const context = await authorizeTransferPaymentStreamResource(event, operation, profileId, streamId)
  if (!context) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorize(event, 'transfer_payment', operation, context.scope)
  if ((fieldId && !isPositivePostgresBigintText(fieldId)) || (optionId && !isPositivePostgresBigintText(optionId))) {
    return await notFound(event, 'FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  if (operation === 'read') return { items: await readAgreementCustomFieldDefinitions(db, streamId), sections: await readAgreementCustomFieldSections(db, streamId) }
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, operation, async trx => {
    if (resource === 'section') {
      if (operation === 'create') {
        const body = await readValidatedBodyI18n(event, StreamFieldSectionCreateSchema)
        return await trx.insertInto('Transfer_Payment_Stream_Field_Section').values({ ...body, egcs_tp_transferpaymentstream: streamId }).returningAll().executeTakeFirstOrThrow()
      }
      if (!sectionId || !isPositivePostgresBigintText(sectionId)) return await notFound(event, 'SECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
      const section = await trx.selectFrom('Transfer_Payment_Stream_Field_Section').selectAll()
        .where('id', '=', sectionId).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!section) return await notFound(event, 'SECTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
      if (operation === 'delete') {
        const field = await trx.selectFrom('Transfer_Payment_Stream_Field').select('id').where('section_id', '=', sectionId).where('_deleted', '=', false).executeTakeFirst()
        if (field) return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_SECTION_IN_USE', key: 'apiErrors.custom_fields.section_in_use' })
        return await trx.updateTable('Transfer_Payment_Stream_Field_Section').set({ _deleted: true }).where('id', '=', sectionId).returningAll().executeTakeFirstOrThrow()
      }
      const body = await readValidatedBodyI18n(event, StreamFieldSectionPatchSchema)
      const merged = await parseI18n(event, StreamFieldSectionCreateSchema, { ...section, ...body })
      return await trx.updateTable('Transfer_Payment_Stream_Field_Section').set(merged).where('id', '=', sectionId).returningAll().executeTakeFirstOrThrow()
    }
    if (resource === 'field' && operation === 'create') {
      const body = await readValidatedBodyI18n(event, StreamFieldCreateSchema)
      const section = await trx.selectFrom('Transfer_Payment_Stream_Field_Section').select('id').where('id', '=', body.section_id).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false).executeTakeFirst()
      if (!section) return await badRequest(event, 'INVALID_SECTION', 'apiErrors.request.invalid_resource')
      return await trx.insertInto('Transfer_Payment_Stream_Field').values({ ...body, egcs_tp_transferpaymentstream: streamId }).returningAll().executeTakeFirstOrThrow()
    }
    const field = fieldId
      ? await trx.selectFrom('Transfer_Payment_Stream_Field').selectAll()
          .where('id', '=', fieldId).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : null
    if (!field) return await notFound(event, 'FIELD_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (resource === 'option' && field.kind !== 'relational') return await badRequest(event, 'INVALID_FIELD_KIND', 'apiErrors.request.invalid_resource')
    if (resource === 'option' && operation === 'create') {
      const body = await readValidatedBodyI18n(event, StreamFieldOptionCreateSchema)
      return await trx.insertInto('Transfer_Payment_Stream_Field_Option').values({ ...body, field_id: field.id }).returningAll().executeTakeFirstOrThrow()
    }
    const option = resource === 'option' && optionId
      ? await trx.selectFrom('Transfer_Payment_Stream_Field_Option').selectAll()
          .where('id', '=', optionId).where('field_id', '=', field.id).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : null
    if (resource === 'option' && !option) return await notFound(event, 'OPTION_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (operation === 'delete') {
      if (await customFieldHasWorkflowReferences(trx, field.id, { optionId: option?.id, includeHistory: true })) {
        return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_IN_USE', key: 'apiErrors.custom_fields.in_use' })
      }
      const agreements = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_customfields')
        .where('egcs_fc_transferpaymentstream', '=', streamId).execute()
      if (agreements.some(agreement => option ? agreement.egcs_fc_customfields[field.id] === option.id : Boolean(agreement.egcs_fc_customfields[field.id]?.trim()))) {
        return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_IN_USE', key: 'apiErrors.custom_fields.in_use' })
      }
      if (option) return await trx.updateTable('Transfer_Payment_Stream_Field_Option').set({ _deleted: true }).where('id', '=', option.id).returningAll().executeTakeFirstOrThrow()
      return await trx.updateTable('Transfer_Payment_Stream_Field').set({ _deleted: true }).where('id', '=', field.id).returningAll().executeTakeFirstOrThrow()
    }
    if (option) {
      const patch = await readValidatedBodyI18n(event, StreamFieldOptionPatchSchema)
      const merged = await parseI18n(event, StreamFieldOptionCreateSchema, { ...option, ...patch })
      if (!merged.active && await customFieldHasWorkflowReferences(trx, field.id, { optionId: option.id, includeHistory: false })) {
        return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_IN_USE', key: 'apiErrors.custom_fields.in_use' })
      }
      return await trx.updateTable('Transfer_Payment_Stream_Field_Option').set(merged).where('id', '=', option.id).returningAll().executeTakeFirstOrThrow()
    }
    const patch = await readValidatedBodyI18n(event, StreamFieldPatchSchema)
    if (patch.kind !== undefined && patch.kind !== field.kind) return await badRequest(event, 'CUSTOM_FIELD_KIND_IMMUTABLE', 'apiErrors.request.invalid_resource')
    const merged = await parseI18n(event, StreamFieldCreateSchema, { ...field, ...patch })
    const section = await trx.selectFrom('Transfer_Payment_Stream_Field_Section').select('id').where('id', '=', merged.section_id).where('egcs_tp_transferpaymentstream', '=', streamId).where('_deleted', '=', false).executeTakeFirst()
    if (!section) return await badRequest(event, 'INVALID_SECTION', 'apiErrors.request.invalid_resource')
    if ((!merged.active || (field.discriminator && !merged.discriminator)) && await customFieldHasWorkflowReferences(trx, field.id, { includeHistory: false })) {
      return await throwApiError(event, { statusCode: 409, code: 'CUSTOM_FIELD_IN_USE', key: 'apiErrors.custom_fields.in_use' })
    }
    return await trx.updateTable('Transfer_Payment_Stream_Field').set(merged).where('id', '=', field.id).returningAll().executeTakeFirstOrThrow()
  })
}
