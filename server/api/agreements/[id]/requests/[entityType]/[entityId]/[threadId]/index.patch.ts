import { defineEventHandler } from 'h3'
import { AgreementRequestThreadEditSchema } from '~~/shared/types/schemas/agreement-requests'
import { authorizeAgreementRequests, requireAgreementRequestId, updateAgreementRequestThread } from '~~/server/utils/agreement-requests'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const prepared = await authorizeAgreementRequests(event, 'update')
  const threadId = await requireAgreementRequestId(event, 'threadId')
  const input = await readValidatedBodyI18n(event, AgreementRequestThreadEditSchema)
  return await updateAgreementRequestThread(event, prepared, threadId, input)
})
