import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementSubmissionCommandSchema } from '~~/shared/types/agreement-submission'
import { commandAgreementSubmission } from '~~/server/utils/agreement-submissions'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, AgreementSubmissionCommandSchema)
  return await commandAgreementSubmission(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'submissionId') ?? '', body)
})
