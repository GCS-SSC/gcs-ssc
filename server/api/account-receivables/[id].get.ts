import { authorizeAccountReceivable, getAccountReceivableDetail } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id)
  return await getAccountReceivableDetail(event, id)
})
