import { requireAuthContext } from '~~/server/utils/authorize'
import { readRuntimeFieldTooltips } from '~~/server/utils/field-tooltip'
import { FieldTooltipRuntimeQuerySchema } from '~~/shared/types/schemas/field-tooltip'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const context = await getValidatedQueryI18n(event, FieldTooltipRuntimeQuerySchema)
  return readRuntimeFieldTooltips(event, context)
})
