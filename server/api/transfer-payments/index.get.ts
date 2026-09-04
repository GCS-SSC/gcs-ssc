import { TransferPaymentListQuerySchema } from '~~/shared/types/schemas'
import { authorize, resolveTransferPaymentVisibility } from '~~/server/utils/authorize'
import { listTransferPayments } from '~~/server/utils/transfer-payment-list-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const { data: visibility } = await authorize(event, 'transfer_payment', 'read', resolveTransferPaymentVisibility(db))
  const query = await getValidatedQueryI18n(event, TransferPaymentListQuerySchema)
  return await listTransferPayments(db, visibility, query)
})
