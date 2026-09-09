import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  listTransferPaymentFiscalYearLookups,
  TransferPaymentFiscalYearLookupListQuerySchema
} from '~~/server/utils/transfer-payment-fiscal-year-lookups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, TransferPaymentFiscalYearLookupListQuerySchema)
  await authorize(event, 'transfer_payment', 'create', { type: 'agency', agencyId: query.agency_id })
  return await listTransferPaymentFiscalYearLookups(event, query)
})
