import { z } from 'zod'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { authorizeTransferPaymentStreamAction } from '~~/server/utils/transfer-payment-assessment-sets'
import { fetchChecklistReviewSchemaForAgency, mapChecklistSchema } from '~~/server/utils/transfer-payment-checklist-schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { ChecklistDefinitionSchema } from '~~/shared/types/schemas/checklist/checklist'
import type { JsonValue } from '~~/shared/types/database'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

const ChecklistSchemaPatchSchema = z.object({
  egcs_cn_name_en: z.string().trim().min(1, { error: 'validation.name_en_required' }).optional(),
  egcs_cn_name_fr: z.string().trim().min(1, { error: 'validation.name_fr_required' }).optional(),
  egcs_cn_outcomename_en: z.string().trim().min(1, { error: 'validation.required' }).optional(),
  egcs_cn_outcomename_fr: z.string().trim().min(1, { error: 'validation.required' }).optional(),
  egcs_cn_disablereviewers: z.boolean().optional(),
  egcs_cn_checklistschema: ChecklistDefinitionSchema.optional()
})

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')
  if (!profileId || !streamId || !schemaId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  await authorizeTransferPaymentStreamAction(event, 'update', streamContext, db)
  const body = await readValidatedBodyI18n(event, ChecklistSchemaPatchSchema)
  if (!body) return await badRequest(event, 'INVALID_CHECKLIST_SCHEMA', 'apiErrors.request.validation_failed')
  const hasReviewSchemaUpdate = body.egcs_cn_name_en !== undefined
    || body.egcs_cn_name_fr !== undefined
    || body.egcs_cn_outcomename_en !== undefined
    || body.egcs_cn_outcomename_fr !== undefined
    || body.egcs_cn_disablereviewers !== undefined
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async (trx, freshContext) => {
      const current = await fetchChecklistReviewSchemaForAgency(trx, freshContext.agencyId, schemaId, true)
      if (!current) return await notFound(event, 'CHECKLIST_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      const publication = await trx.selectFrom('Common_Publication').select('egcs_cn_state')
        .where('id', '=', schemaId).where('egcs_cn_kind', '=', 'review_schema').executeTakeFirst()
      if (publication?.egcs_cn_state === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      if (body.egcs_cn_checklistschema !== undefined && current.checklist_schema_id === null) {
        return await notFound(event, 'CHECKLIST_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      }
      if (hasReviewSchemaUpdate) {
        await trx.updateTable('Common_Review_Schema').set({
          ...(body.egcs_cn_name_en !== undefined ? { egcs_cn_name_en: body.egcs_cn_name_en } : {}),
          ...(body.egcs_cn_name_fr !== undefined ? { egcs_cn_name_fr: body.egcs_cn_name_fr } : {}),
          ...(body.egcs_cn_outcomename_en !== undefined ? { egcs_cn_outcomename_en: body.egcs_cn_outcomename_en } : {}),
          ...(body.egcs_cn_outcomename_fr !== undefined ? { egcs_cn_outcomename_fr: body.egcs_cn_outcomename_fr } : {}),
          ...(body.egcs_cn_disablereviewers !== undefined ? { egcs_cn_disablereviewers: body.egcs_cn_disablereviewers } : {})
        }).where('id', '=', schemaId).execute()
      }
      if (body.egcs_cn_checklistschema !== undefined) {
        await trx.updateTable('Common_Checklist_Schema').set({
          egcs_cn_checklistschema: body.egcs_cn_checklistschema as unknown as JsonValue
        }).where('id', '=', String(current.checklist_schema_id)).execute()
      }
      const updated = await fetchChecklistReviewSchemaForAgency(trx, freshContext.agencyId, schemaId)
      if (!updated) return await notFound(event, 'CHECKLIST_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      return await mapChecklistSchema(trx, updated)
    }
  )
})
