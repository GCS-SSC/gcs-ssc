import { authorizeJournalVoucher, createJournalVoucher } from '~~/server/utils/journal-voucher'
import { JournalVoucherReversalSchema } from '~~/shared/types/schemas/journal-voucher'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorizeJournalVoucher(event, id)
  const body = await readValidatedBodyI18n(event, JournalVoucherReversalSchema)
  return await createJournalVoucher(event, { ...body, egcs_fc_payment: context.paymentId }, { reversalOf: id })
})
