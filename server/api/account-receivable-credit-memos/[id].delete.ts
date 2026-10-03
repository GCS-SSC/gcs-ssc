import { authorizeAccountReceivableCreditMemo, deleteAccountReceivableCreditMemo } from '~~/server/utils/account-receivable-credit-memo'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableCreditMemo(event, id, 'delete')
  return await deleteAccountReceivableCreditMemo(event, id)
})
