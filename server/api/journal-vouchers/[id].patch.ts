import { authorizeJournalVoucher, editJournalVoucher } from '~~/server/utils/journal-voucher'
import { JournalVoucherEditSchema } from '~~/shared/types/schemas/journal-voucher'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeJournalVoucher(event, id, 'update')
  return await editJournalVoucher(event, id, await readValidatedBodyI18n(event, JournalVoucherEditSchema))
})
