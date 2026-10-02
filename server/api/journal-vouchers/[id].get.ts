import { authorizeJournalVoucher, getJournalVoucherDetail } from '~~/server/utils/journal-voucher'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeJournalVoucher(event, id)
  return await getJournalVoucherDetail(event, id)
})
