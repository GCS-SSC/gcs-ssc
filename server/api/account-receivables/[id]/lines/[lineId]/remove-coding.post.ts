import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { writeAccountReceivableLine } from '~~/server/utils/account-receivable-lines'
import { zeroMoney } from '~~/shared/utils/money'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const owner = await authorizeAccountReceivable(event, id, 'update')
  return await writeAccountReceivableLine(event, id, { egcs_fc_amount: zeroMoney(owner.currency), egcs_fc_accountreceivablechartofaccount: null }, getRouterParam(event, 'lineId') ?? '', { removeCoding: true })
})
