import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementSubmissionListQuerySchema } from '~~/shared/types/agreement-submission'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { listAgreementSubmissions } from '~~/server/utils/agreement-submissions'

// eslint-disable-next-line local/require-authorize -- delegated to the fresh scoped Submission read
export default defineEventHandler(async event => {
  const query = await getValidatedQueryI18n(event, AgreementSubmissionListQuerySchema)
  return await listAgreementSubmissions(event, getRouterParam(event, 'id') ?? '', query)
})
