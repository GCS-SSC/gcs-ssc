import { defineEventHandler, getRouterParam } from 'h3'
import { listAgreementSubmissionAmendments } from '~~/server/utils/agreement-submissions'

// eslint-disable-next-line local/require-authorize -- delegated to the fresh scoped Submission read
export default defineEventHandler(async event =>
  await listAgreementSubmissionAmendments(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'submissionId') ?? '')
)
