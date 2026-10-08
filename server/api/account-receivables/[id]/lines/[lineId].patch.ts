import { AccountReceivableLinePatchSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { writeAccountReceivableLine } from '~~/server/utils/account-receivable-lines'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'update')
  return await writeAccountReceivableLine(event, id, await readValidatedBodyI18n(event, AccountReceivableLinePatchSchema), getRouterParam(event, 'lineId') ?? '')
})
