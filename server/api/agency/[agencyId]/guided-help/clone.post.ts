import { defineEventHandler, getRouterParam } from 'h3'
import { requireAuthContext } from '~~/server/utils/authorize'
import { cloneGuidedHelp } from '~~/server/utils/guided-help'
import { GuidedHelpCloneSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpCloneSchema)
  return cloneGuidedHelp(event, getRouterParam(event, 'agencyId') ?? '', input.sourceVersionId)
})
