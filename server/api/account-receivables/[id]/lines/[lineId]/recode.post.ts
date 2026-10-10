import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { writeAccountReceivableLine } from '~~/server/utils/account-receivable-lines'
import { AccountReceivableRecodeSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { parseMoney } from '~~/shared/utils/money'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'update')
  const input = await readValidatedBodyI18n(event, AccountReceivableRecodeSchema)
  return await writeAccountReceivableLine(event, id, { egcs_fc_amount: parseMoney('0.00'), egcs_fc_accountreceivablechartofaccount: null }, getRouterParam(event, 'lineId') ?? '', { recodeTo: input.egcs_fc_accountreceivablechartofaccount })
})
