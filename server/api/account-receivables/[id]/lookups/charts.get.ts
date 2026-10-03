import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { listAccountReceivableChartLookup } from '~~/server/utils/account-receivable-lookups'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id)
  return await listAccountReceivableChartLookup(event, id)
})
