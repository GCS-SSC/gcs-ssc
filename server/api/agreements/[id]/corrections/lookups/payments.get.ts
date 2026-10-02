import { authorizeCorrectionAgreement } from '~~/server/utils/correction'
import { listAgreementPaymentAccountingSources } from '~~/server/utils/agreement-payment-source'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { z } from 'zod'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'

const QuerySchema = PaginationSchema.extend({ currency: z.enum(CURRENCY_CODES_ENUM).optional(), commitmentId: z.string().min(1).optional() })

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'create')
  const input = await getValidatedQueryI18n(event, QuerySchema)
  return await listAgreementPaymentAccountingSources(event, event.context.$db, { agreementId, ...input })
})
