import { AccountReceivableCancelSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { cancelAccountReceivableCase } from '~~/server/utils/account-receivable-completion'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeAccountReceivable(event, id, 'update')
  const input = await readValidatedBodyI18n(event, AccountReceivableCancelSchema)
  return await cancelAccountReceivableCase(event, id, context.entityType, input.egcs_fc_reason)
})
