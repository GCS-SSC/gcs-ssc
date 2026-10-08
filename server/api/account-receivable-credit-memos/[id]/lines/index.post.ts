import { authorizeAccountReceivableCreditMemo } from '~~/server/utils/account-receivable-credit-memo'
import { writeAccountReceivableCreditMemoLine } from '~~/server/utils/account-receivable-credit-memo-lines'
import { AccountReceivableCreditMemoLineCreateSchema } from '~~/shared/types/schemas/account-receivable'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeAccountReceivableCreditMemo(event, id, 'update')
  const input = await readValidatedBodyI18n(event, AccountReceivableCreditMemoLineCreateSchema)
  return await writeAccountReceivableCreditMemoLine(event, id, input)
})
