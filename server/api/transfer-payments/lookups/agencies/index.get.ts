import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import {
  listTransferPaymentAgencyLookups,
  resolveTransferPaymentAgencyLookupIds,
  TransferPaymentAgencyLookupListQuerySchema
} from '~~/server/utils/transfer-payment-agency-lookups'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = await getValidatedQueryI18n(event, TransferPaymentAgencyLookupListQuerySchema)
  const agencyIds = await resolveTransferPaymentAgencyLookupIds(event, query)
  return await listTransferPaymentAgencyLookups(event.context.$db, agencyIds, query)
})
