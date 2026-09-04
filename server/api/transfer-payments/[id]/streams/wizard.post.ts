import { TransferPaymentStreamPolymorphicWizardSchema } from '~~/shared/types/schemas'
import {
  createTransferPaymentStreamFromWizardInTransaction,
  validateTransferPaymentStreamWizardReferences
} from '~~/server/utils/transfer-payment-stream-wizard-routes'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentWrite } from '~~/server/utils/transfer-payment-write-transaction'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const profileAccess = await authorizeTransferPaymentProfileResource(event, 'create', profileId)
  if (!profileAccess) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const payload = await readValidatedBodyI18n(event, TransferPaymentStreamPolymorphicWizardSchema)

  try {
    return await executeFreshAuthorizedTransferPaymentWrite(
      event,
      db,
      profileId,
      profileAccess.agencyId,
      'create',
      async (trx, currentContext) => {
        const referenceError = await validateTransferPaymentStreamWizardReferences({
          event,
          db: trx,
          profileId,
          agencyId: currentContext.agencyId,
          payload
        })

        if (referenceError) {
          return referenceError
        }

        return await createTransferPaymentStreamFromWizardInTransaction(trx, profileId, payload)
      }
    )
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
