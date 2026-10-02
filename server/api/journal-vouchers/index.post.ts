import { JournalVoucherCreateSchema } from '~~/shared/types/schemas/journal-voucher'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { createJournalVoucher } from '~~/server/utils/journal-voucher'

export default defineEventHandler(async event => {
  // Authorization is refreshed inside createJournalVoucher's Agreement transaction.
  return await createJournalVoucher(event, await readValidatedBodyI18n(event, JournalVoucherCreateSchema))
})
