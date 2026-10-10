import { AccountReceivableClaimReductionSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAccountReceivable } from '~~/server/utils/account-receivable'
import { saveAccountReceivableClaimReductions } from '~~/server/utils/account-receivable-claim-reductions'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivable(event, id, 'update')
  return await saveAccountReceivableClaimReductions(event, id, await readValidatedBodyI18n(event, AccountReceivableClaimReductionSchema))
})
