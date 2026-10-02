import { authorizeJournalVoucher, deleteJournalVoucher } from '~~/server/utils/journal-voucher'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeJournalVoucher(event, id, 'delete')
  return await deleteJournalVoucher(event, id)
})
