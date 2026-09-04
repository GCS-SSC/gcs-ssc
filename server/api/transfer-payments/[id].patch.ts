import { TransferPaymentProfileBaseSchema } from '~~/shared/types/schemas'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

const PatchSchema = TransferPaymentProfileBaseSchema.partial().superRefine((data, ctx) => {
  if (data.egcs_tp_datestart && data.egcs_tp_dateend && data.egcs_tp_datestart > data.egcs_tp_dateend) {
    ctx.addIssue({
      code: 'custom',
      message: 'validation.date_range',
      path: ['egcs_tp_dateend']
    })
  }
})

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'update', id)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }
  const validated = await readValidatedBodyI18n(event, PatchSchema)
  const { egcs_tp_agency: _ignoredAgency, ...safeUpdate } = validated
  if (Object.keys(safeUpdate).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }

  return await executeFreshAuthorizedTransferPaymentWrite(
    event,
    db,
    id,
    access.agencyId,
    'update',
    async trx => {
      const currentProfile = await trx
        .selectFrom('Transfer_Payment_Profile')
        .where('id', '=', id)
        .where('_deleted', '=', false)
        .selectAll()
        .executeTakeFirst()
      if (!currentProfile) {
        return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
      }

      if (
        validated.egcs_tp_agency
        && String(validated.egcs_tp_agency) !== String(currentProfile.egcs_tp_agency)
      ) {
        return await badRequest(
          event,
          'TRANSFER_PAYMENT_AGENCY_IMMUTABLE',
          'apiErrors.transfer_payment.agency_change_not_allowed'
        )
      }

      const startDate = validated.egcs_tp_datestart ?? currentProfile.egcs_tp_datestart
      const endDate = validated.egcs_tp_dateend ?? currentProfile.egcs_tp_dateend
      if (startDate > endDate) {
        return await badRequest(
          event,
          'TRANSFER_PAYMENT_DATE_RANGE_INVALID',
          'apiErrors.transfer_payment.date_range_invalid'
        )
      }

      return await trx
        .updateTable('Transfer_Payment_Profile')
        .set(safeUpdate)
        .where('id', '=', id)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirstOrThrow()
    }
  )
})
