import { AccountReceivableCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivableAgreement, createAccountReceivable } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableAgreement(event, id, 'create')
  return await createAccountReceivable(event, id, await readValidatedBodyI18n(event, AccountReceivableCreateSchema))
})
