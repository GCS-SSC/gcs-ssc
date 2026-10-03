import { AccountReceivableCreditMemoCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, resolveTransferPaymentVisibility } from '~~/server/utils/authorize'
import { forbidden } from '~~/server/utils/api-errors'
import { createAccountReceivableCreditMemo } from '~~/server/utils/account-receivable-credit-memo'

export default defineEventHandler(async event => {
  const access = await authorize(event, 'account_receivable', 'create', resolveTransferPaymentVisibility(event.context.$db))
  if (access.data?.access === 'none') return await forbidden(event)
  return await createAccountReceivableCreditMemo(event, await readValidatedBodyI18n(event, AccountReceivableCreditMemoCreateSchema))
})
