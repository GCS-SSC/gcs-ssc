import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivableAgreement, listAccountReceivables } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableAgreement(event, id)
  return await listAccountReceivables(event, id, await getValidatedQueryI18n(event, PaginationSchema))
})
