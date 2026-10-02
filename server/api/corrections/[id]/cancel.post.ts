import { CorrectionCancelSchema } from '~~/shared/types/schemas/correction'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeCorrection } from '~~/server/utils/correction'
import { cancelCorrection } from '~~/server/utils/correction-completion'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeCorrection(event, id, 'update')
  const input = await readValidatedBodyI18n(event, CorrectionCancelSchema)
  return await cancelCorrection(event, id, input.egcs_fc_reason)
})
