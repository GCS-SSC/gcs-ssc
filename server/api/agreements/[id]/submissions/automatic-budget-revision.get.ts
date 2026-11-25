import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
import { z } from 'zod'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { getAutomaticSubmissionBudgetRevision } from '~~/server/utils/agreement-submissions'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { requireAuthContext } from '~~/server/utils/authorize'

const AutomaticBudgetRevisionQuerySchema = z.strictObject({ amendmentId: PositivePostgresBigintIdSchema })

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const { amendmentId } = await getValidatedQueryI18n(event, AutomaticBudgetRevisionQuerySchema)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  return await getAutomaticSubmissionBudgetRevision(event, getRouterParam(event, 'id') ?? '', amendmentId)
})
