import { defineEventHandler } from 'h3'
import { AgreementRequestCreateSchema } from '~~/shared/types/schemas/agreement-requests'
import { authorizeAgreementRequests, saveAgreementRequest } from '~~/server/utils/agreement-requests'
import { readAgreementRequestMultipart } from '~~/server/utils/agreement-request-files'

export default defineEventHandler(async event => {
  const prepared = await authorizeAgreementRequests(event, 'update')
  const { input, files } = await readAgreementRequestMultipart(event, AgreementRequestCreateSchema)
  return await saveAgreementRequest(event, prepared, { kind: 'start', input }, files)
})
