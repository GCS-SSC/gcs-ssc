import { defineEventHandler } from 'h3'
import { AgreementRequestEntryEditSchema } from '~~/shared/types/schemas/agreement-requests'
import { authorizeAgreementRequests, requireAgreementRequestId, updateAgreementRequestEntry } from '~~/server/utils/agreement-requests'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

export default defineEventHandler(async event => {
  const prepared = await authorizeAgreementRequests(event, 'update')
  const threadId = await requireAgreementRequestId(event, 'threadId')
  const entryId = await requireAgreementRequestId(event, 'entryId')
  const input = await readValidatedBodyI18n(event, AgreementRequestEntryEditSchema)
  return await updateAgreementRequestEntry(event, prepared, threadId, entryId, input)
})
