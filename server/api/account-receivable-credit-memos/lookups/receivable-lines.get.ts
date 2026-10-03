import { authorize, resolveTransferPaymentVisibility } from '~~/server/utils/authorize'
import { forbidden } from '~~/server/utils/api-errors'
import { listAccountReceivableCreditMemoLineLookup } from '~~/server/utils/account-receivable-lookups'

export default defineEventHandler(async event => {
  const access = await authorize(event, 'account_receivable', 'create', resolveTransferPaymentVisibility(event.context.$db))
  if (access.data?.access === 'none') return await forbidden(event)
  return await listAccountReceivableCreditMemoLineLookup(event)
})
