import { requireAuthContext } from '~~/server/utils/authorize'
import { createGuidedHelp } from '~~/server/utils/guided-help'
import { GuidedHelpCreateSchema } from '~~/shared/types/schemas/guided-help'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const query = getQuery(event)
  const input = await readValidatedBodyI18n(event, GuidedHelpCreateSchema)
  return createGuidedHelp(event, typeof query.agencyId === 'string' ? query.agencyId : null, input)
})
