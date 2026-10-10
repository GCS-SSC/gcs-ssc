import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { writeAccountReceivableLine } from '~~/server/utils/account-receivable-lines'
import { parseMoney } from '~~/shared/utils/money'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'update')
  return await writeAccountReceivableLine(event, id, { egcs_fc_amount: parseMoney('0.00'), egcs_fc_accountreceivablechartofaccount: null }, getRouterParam(event, 'lineId') ?? '', { removeCoding: true })
})
