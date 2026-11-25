import { defineEventHandler } from 'h3'
import { AgreementRequestEntryCreateSchema } from '~~/shared/types/schemas/agreement-requests'
import { authorizeAgreementRequests, requireAgreementRequestId, saveAgreementRequest } from '~~/server/utils/agreement-requests'
import { readAgreementRequestMultipart } from '~~/server/utils/agreement-request-files'

export default defineEventHandler(async event => {
  const prepared = await authorizeAgreementRequests(event, 'update')
  const threadId = await requireAgreementRequestId(event, 'threadId')
  const { input, files } = await readAgreementRequestMultipart(event, AgreementRequestEntryCreateSchema)
  return await saveAgreementRequest(event, prepared, { kind: 'append', threadId, input }, files)
})
