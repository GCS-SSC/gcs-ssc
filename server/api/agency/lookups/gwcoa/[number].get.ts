import { z } from 'zod'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { RequiredStringId } from '~~/shared/types/schemas'

const AgencyGwcoaDetailQuerySchema = z.object({
  agency_id: RequiredStringId().optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((value, context) => {
  if (value.permission_action === 'update' && value.agency_id === undefined) {
    context.addIssue({ code: 'custom', path: ['agency_id'], message: 'validation.id_required' })
  }
})

const AgencyGwcoaNumberSchema = z.coerce.number({ error: 'validation.invalid_number' })
  .int({ error: 'validation.invalid_number' })
  .nonnegative({ error: 'validation.invalid_number' })

export default defineEventHandler(async event => {
  const db = event.context.$db
  const numberParam = getRouterParam(event, 'number')
  if (!numberParam) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const query = await getValidatedQueryI18n(event, AgencyGwcoaDetailQuerySchema)
  if (query.permission_action === 'update' && query.agency_id !== undefined) {
    await authorize(event, 'agency', 'update', { type: 'agency', agencyId: query.agency_id })
  } else {
    await authorize(event, 'agency', 'create', { type: 'global' })
  }
  const number = await parseI18n(event, AgencyGwcoaNumberSchema, numberParam)

  const gwcoa = await db.selectFrom('Common_GWCOA')
    .where('egcs_cn_number', '=', number)
    .where('_deleted', '=', false)
    .select(['egcs_cn_number', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .executeTakeFirst()

  if (!gwcoa) return await notFound(event, 'GWCOA_NOT_FOUND', 'apiErrors.agency.gwcoa_not_found')
  return gwcoa
})
