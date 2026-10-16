import { requireAuthContext } from '~~/server/utils/authorize'
import { adoptGuidedHelp } from '~~/server/utils/guided-help'
import { GuidedHelpAdoptSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpAdoptSchema)
  return adoptGuidedHelp(event, getRouterParam(event, 'agencyId') ?? '', input)
})
