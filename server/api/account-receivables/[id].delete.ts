import { authorizeAccountReceivable, deleteAccountReceivable } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'delete')
  return await deleteAccountReceivable(event, id)
})
