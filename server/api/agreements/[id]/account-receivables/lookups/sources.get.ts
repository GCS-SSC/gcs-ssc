import { authorizeAccountReceivableAgreement } from '~~/server/utils/account-receivable'
import { listAccountReceivableSourceLookup } from '~~/server/utils/account-receivable-lookups'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableAgreement(event, id, 'create')
  return await listAccountReceivableSourceLookup(event, id)
})
