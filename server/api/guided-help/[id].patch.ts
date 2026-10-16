import { requireAuthContext } from '~~/server/utils/authorize'
import { updateGuidedHelp } from '~~/server/utils/guided-help'
import { GuidedHelpCreateSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpCreateSchema)
  return updateGuidedHelp(event, getRouterParam(event, 'id') ?? '', input)
})
