import { authorizeCorrectionAgreement } from '~~/server/utils/correction'
import { listAgreementPaymentAccountingSources } from '~~/server/utils/agreement-payment-source'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'create')
  const input = await getValidatedQueryI18n(event, PaginationSchema)
  return await listAgreementPaymentAccountingSources(event, event.context.$db, { agreementId, ...input })
})
