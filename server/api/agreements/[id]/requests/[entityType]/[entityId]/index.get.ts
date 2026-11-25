import { defineEventHandler } from 'h3'
import { authorizeAgreementRequests, listAgreementRequests } from '~~/server/utils/agreement-requests'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async () => {
  const prepared = await authorizeAgreementRequests(event, 'read')
  return await listAgreementRequests(event, prepared)
}, { authorization: 'snapshot' }))
