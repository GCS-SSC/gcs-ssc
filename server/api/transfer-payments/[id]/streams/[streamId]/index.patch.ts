import { sql } from 'kysely'
import { TransferPaymentStreamPatchSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentStreamResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { executeFreshAuthorizedTransferPaymentStreamWrite } from '~~/server/utils/transfer-payment-write-transaction'
import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- delegated to authorizeTransferPaymentStreamResource
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const streamId = getRouterParam(event, 'streamId')
  if (!profileId || !streamId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentStreamResource(event, 'update', profileId, streamId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  const validated = await readValidatedBodyI18n(event, TransferPaymentStreamPatchSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentStreamWrite(
      event, db, profileId, access.agencyId, streamId, 'update', async trx => {
        if (Object.keys(validated).length === 0) {
          return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
        }
        // The shared transaction already holds the Program and target Stream locks.
        const current = await trx.selectFrom('Transfer_Payment_Stream')
          .select(['egcs_tp_parentstream', 'egcs_tp_name_en', 'egcs_tp_name_fr', 'egcs_tp_active'])
          .where('id', '=', streamId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .executeTakeFirstOrThrow()

        // A deleted parent remains supported history. Only a replacement must
        // satisfy current live membership and cycle checks.
        if (validated.egcs_tp_parentstream && validated.egcs_tp_parentstream !== current.egcs_tp_parentstream) {
          if (String(validated.egcs_tp_parentstream) === String(streamId)) {
            return await badRequest(event, 'TRANSFER_PAYMENT_PARENT_STREAM_INVALID', 'apiErrors.transfer_payment.parent_stream_invalid')
          }
          let ancestorId: string | null = String(validated.egcs_tp_parentstream)
          const visited = new Set<string>()
          while (ancestorId) {
            if (ancestorId === String(streamId) || visited.has(ancestorId)) {
              return await badRequest(event, 'TRANSFER_PAYMENT_PARENT_STREAM_INVALID', 'apiErrors.transfer_payment.parent_stream_invalid')
            }
            visited.add(ancestorId)
            const ancestor = await trx.selectFrom('Transfer_Payment_Stream')
              .where('id', '=', ancestorId)
              .where('egcs_tp_transferpaymentprofile', '=', profileId)
              .where('_deleted', '=', false)
              .select(['id', 'egcs_tp_parentstream'])
              .forUpdate()
              .executeTakeFirst()
            if (!ancestor) {
              return await badRequest(event, 'TRANSFER_PAYMENT_PARENT_STREAM_INVALID', 'apiErrors.transfer_payment.parent_stream_invalid')
            }
            ancestorId = ancestor.egcs_tp_parentstream ? String(ancestor.egcs_tp_parentstream) : null
          }
        }

        const updatePayload = { ...validated }
        if (Object.hasOwn(validated, 'egcs_tp_parentstream')) {
          updatePayload.egcs_tp_parentstream = validated.egcs_tp_parentstream
            ? String(validated.egcs_tp_parentstream)
            : null
        }
        const nameEn = normalizeTextKey(validated.egcs_tp_name_en ?? current.egcs_tp_name_en)
        const nameFr = normalizeTextKey(validated.egcs_tp_name_fr ?? current.egcs_tp_name_fr)
        const isActive = validated.egcs_tp_active ?? current.egcs_tp_active
        const changesActiveName = !current.egcs_tp_active
          || nameEn !== normalizeTextKey(current.egcs_tp_name_en)
          || nameFr !== normalizeTextKey(current.egcs_tp_name_fr)
        // Match creation's bilingual rule without rejecting unrelated edits to
        // historical case variants allowed by the existing database index.
        if (isActive && changesActiveName) {
          const duplicate = await trx.selectFrom('Transfer_Payment_Stream')
            .select('id')
            .where('id', '!=', streamId)
            .where('egcs_tp_transferpaymentprofile', '=', profileId)
            .where('egcs_tp_active', '=', true)
            .where('_deleted', '=', false)
            .where(sql<boolean>`lower(btrim(egcs_tp_name_en)) = ${nameEn}`)
            .where(sql<boolean>`lower(btrim(egcs_tp_name_fr)) = ${nameFr}`)
            .executeTakeFirst()
          if (duplicate) {
            return await badRequest(
              event,
              'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_STREAM_NAME',
              'apiErrors.transfer_payment.duplicate_program_stream_name'
            )
          }
        }
        return await trx.updateTable('Transfer_Payment_Stream')
          .set(updatePayload)
          .where('id', '=', streamId)
          .where('egcs_tp_transferpaymentprofile', '=', profileId)
          .where('_deleted', '=', false)
          .returningAll()
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
