import { defineEventHandler, getRouterParam } from 'h3'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { saveFieldTooltip } from '~~/server/utils/field-tooltip'
import { FieldTooltipSaveSchema } from '~~/shared/types/schemas/field-tooltip'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId') ?? ''
  await authorize(event, 'help', 'update', { type: 'agency', agencyId })
  const input = await readValidatedBodyI18n(event, FieldTooltipSaveSchema)
  return saveFieldTooltip(event, agencyId, input, getRouterParam(event, 'id') ?? '')
})
