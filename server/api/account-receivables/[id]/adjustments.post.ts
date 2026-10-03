import { AccountReceivableCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable, createAccountReceivable } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeAccountReceivable(event, id)
  const input = await readValidatedBodyI18n(event, AccountReceivableCreateSchema)
  return await createAccountReceivable(event, context.agreementId, { ...input, egcs_fc_linkedreceivable: id })
})
