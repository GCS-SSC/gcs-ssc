import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementSubmissionReceiptSchema } from '~~/shared/types/agreement-submission'
import { receiveAgreementSubmission } from '~~/server/utils/agreement-submissions'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'

import { requireAuthContext } from '~~/server/utils/authorize'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const body = await readValidatedBodyI18n(event, AgreementSubmissionReceiptSchema)
  return await receiveAgreementSubmission(event, getRouterParam(event, 'id') ?? '', body)
})
