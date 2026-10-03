import { AccountReceivableEditSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable, editAccountReceivable } from '~~/server/utils/account-receivable'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'update')
  return await editAccountReceivable(event, id, await readValidatedBodyI18n(event, AccountReceivableEditSchema))
})
