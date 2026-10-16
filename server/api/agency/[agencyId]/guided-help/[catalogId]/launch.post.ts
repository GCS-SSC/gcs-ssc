import { requireAuthContext } from '~~/server/utils/authorize'
import { launchGuidedHelp } from '~~/server/utils/guided-help'
import { GuidedHelpLaunchSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpLaunchSchema)
  return launchGuidedHelp(event, getRouterParam(event, 'agencyId') ?? '', getRouterParam(event, 'catalogId') ?? '', input.view)
})
