import { CorrectionCreateSchema } from '~~/shared/types/schemas/correction'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeCorrectionAgreement, createCorrection } from '~~/server/utils/correction'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'create')
  return await createCorrection(event, agreementId, await readValidatedBodyI18n(event, CorrectionCreateSchema))
})
