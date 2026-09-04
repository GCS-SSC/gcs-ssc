import { sql } from 'kysely'
import { AssessmentReviewSchemaPatchSchema, createAssessmentReviewSchemaPatchSchema } from '~~/shared/types/schemas'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import {
  authorizeTransferPaymentStreamAction,
  fetchAssessmentReviewSchemaForAgency
} from '~~/server/utils/transfer-payment-assessment-sets'
import { mapAssessmentReviewSchema } from '~~/server/utils/review-schema-versioning'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'

// Authorization is enforced by authorizeTransferPaymentStreamAction, which wraps authorize().
// eslint-disable-next-line local/require-authorize
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  const schemaId = getRouterParam(event, 'schemaId')

  if (!profileId || !streamId || !schemaId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const streamContext = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!streamContext) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }

  await authorizeTransferPaymentStreamAction(event, 'update', streamContext, db)

  const body = await readValidatedBodyI18n(event, AssessmentReviewSchemaPatchSchema)
  return await executeFreshAuthorizedTransferPaymentStreamWrite(
    event, db, profileId, streamContext.agencyId, streamId, 'update', async (trx, freshContext) => {
      const currentSchema = await fetchAssessmentReviewSchemaForAgency(trx, freshContext.agencyId, schemaId, true)
      if (!currentSchema) {
        return await notFound(event, 'ASSESSMENT_SCHEMA_NOT_FOUND', 'apiErrors.transfer_payment.review_schema_not_found')
      }
      const publication = await trx.selectFrom('Common_Publication').select('egcs_cn_state')
        .where('id', '=', schemaId).where('egcs_cn_kind', '=', 'review_schema').executeTakeFirst()
      if (publication?.egcs_cn_state === 'retired') {
        return await throwApiError(event, {
          statusCode: 409, code: 'PUBLICATION_RETIRED', key: 'apiErrors.request.invalid_status'
        })
      }
      const validatedBody = await parseI18n(event, createAssessmentReviewSchemaPatchSchema(currentSchema.egcs_cn_entitytype), body)
      const patchableFields: Array<keyof typeof validatedBody> = [
        'egcs_cn_name_en',
        'egcs_cn_name_fr',
        'egcs_cn_outcomename_en',
        'egcs_cn_outcomename_fr',
        'egcs_cn_disablecustomoutcomes',
        'egcs_cn_disablealignment',
        'egcs_cn_disablereviewers',
        'egcs_cn_scoringmatrix',
        'egcs_cn_assessmentschema'
      ]
      const updatePayload: Record<string, unknown> = {}
      patchableFields.forEach(field => {
        const value = validatedBody[field]
        if (value === undefined) return
        updatePayload[field] = field === 'egcs_cn_scoringmatrix' || field === 'egcs_cn_assessmentschema'
          ? sql`${JSON.stringify(value)}::jsonb`
          : value
      })

      const updatedSchema = Object.keys(updatePayload).length === 0
        ? currentSchema
        : await trx
            .updateTable('Common_Review_Schema')
            .set(updatePayload)
            .where('id', '=', schemaId)
            .where('egcs_cn_agency', '=', currentSchema.egcs_cn_agency)
            .returningAll()
            .executeTakeFirstOrThrow()

      return await mapAssessmentReviewSchema(trx, updatedSchema)
    }
  )
})
