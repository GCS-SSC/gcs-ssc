import { z } from 'zod'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { resolveExtensionRuntimeResponse } from '~~/server/utils/extension-runtime-route'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const RuntimeSlotQuerySchema = z.object({
  slot: z.enum([
    'textarea.after',
    'agreement.descriptions.after',
    'agreement.profile.classification.fields',
    'agreement.profile.profile.fields',
    'agreement.profile.risk-management.fields',
    'agreement.profile.sections.after',
    'proponent.descriptions.after'
  ]),
  streamId: z.string().optional(),
  agencyId: z.string().optional(),
  applicantRecipientId: z.string().optional(),
  agreementId: z.string().optional(),
  permissionAction: z.enum(['create', 'read', 'update']).default('read')
})

export default defineEventHandler(async event => {
  await authorize(event, 'agency', 'read', async () => ({ bypass: true }))
  const rawQuery = getQuery(event)
  const rawEntityIds = [
    rawQuery.streamId,
    rawQuery.agencyId,
    rawQuery.applicantRecipientId,
    rawQuery.agreementId
  ]
  if (rawEntityIds.some(value => value !== undefined
    && (typeof value !== 'string' || !isPositivePostgresBigintText(value)))) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')
  }
  const query = await parseI18n(event, RuntimeSlotQuerySchema, rawQuery)
  return await resolveExtensionRuntimeResponse(event, query)
})
