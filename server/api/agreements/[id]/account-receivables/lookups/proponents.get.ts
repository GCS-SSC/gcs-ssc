import { authorizeAccountReceivableAgreement } from '~~/server/utils/account-receivable'
import { listAccountReceivableProponentLookup } from '~~/server/utils/account-receivable-lookups'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableAgreement(event, id, 'create')
  return await listAccountReceivableProponentLookup(event, id)
})
