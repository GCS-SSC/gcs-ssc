import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { deleteAccountReceivableLine } from '~~/server/utils/account-receivable-lines'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'delete')
  return await deleteAccountReceivableLine(event, id, getRouterParam(event, 'lineId') ?? '')
})
