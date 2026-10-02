import { CorrectionEditSchema } from '~~/shared/types/schemas/correction'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeCorrection, editCorrection } from '~~/server/utils/correction'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeCorrection(event, id, 'update')
  return await editCorrection(event, id, await readValidatedBodyI18n(event, CorrectionEditSchema))
})
