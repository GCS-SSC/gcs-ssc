import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { readAccountReceivableClaimReductionChoices } from '~~/server/utils/account-receivable-claim-reductions'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id)
  return await readAccountReceivableClaimReductionChoices(event, id)
})
