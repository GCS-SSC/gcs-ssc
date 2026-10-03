import { authorizeAccountReceivableCreditMemo, getAccountReceivableCreditMemoDetail } from '~~/server/utils/account-receivable-credit-memo'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableCreditMemo(event, id, 'read')
  return await getAccountReceivableCreditMemoDetail(event, id)
})
