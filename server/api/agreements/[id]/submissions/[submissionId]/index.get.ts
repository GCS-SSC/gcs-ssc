import { defineEventHandler, getRouterParam } from 'h3'
import { getAgreementSubmission } from '~~/server/utils/agreement-submissions'

// eslint-disable-next-line local/require-authorize -- delegated to the fresh scoped Submission read
export default defineEventHandler(async event =>
  await getAgreementSubmission(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'submissionId') ?? '')
)
