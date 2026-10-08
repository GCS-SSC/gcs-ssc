import { authorizeAccountReceivableCreditMemo } from '~~/server/utils/account-receivable-credit-memo'
import { deleteAccountReceivableCreditMemoLine } from '~~/server/utils/account-receivable-credit-memo-lines'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableCreditMemo(event, id, 'delete')
  return await deleteAccountReceivableCreditMemoLine(event, id, getRouterParam(event, 'lineId') ?? '')
})
