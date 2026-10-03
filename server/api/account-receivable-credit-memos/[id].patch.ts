import { authorizeAccountReceivableCreditMemo, editAccountReceivableCreditMemo } from '~~/server/utils/account-receivable-credit-memo'
import { AccountReceivableCreditMemoEditSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableCreditMemo(event, id, 'update')
  return await editAccountReceivableCreditMemo(event, id, await readValidatedBodyI18n(event, AccountReceivableCreditMemoEditSchema))
})
