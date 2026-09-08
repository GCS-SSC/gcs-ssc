import { z } from 'zod'
import { parseI18n } from '~~/server/utils/api-validate'
import { authorize } from '~~/server/utils/authorize'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const AgencyGwcoaDetailQuerySchema = z.object({
  agency_id: PositivePostgresBigintIdSchema.optional(),
  permission_action: z.enum(['create', 'update']).default('create')
}).superRefine((value, context) => {
  if (value.permission_action === 'update' && value.agency_id === undefined) {
    context.addIssue({ code: 'custom', path: ['agency_id'], message: 'validation.id_required' })
  }
})

const AgencyGwcoaNumberSchema = z.coerce.number({ error: 'validation.invalid_number' })
  .int({ error: 'validation.invalid_number' })
  .nonnegative({ error: 'validation.invalid_number' })
  .max(32767, { error: 'validation.invalid_number' })

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

  let selection = db.selectFrom('Common_GWCOA')
    .where('egcs_cn_number', '=', number)
  if (query.permission_action === 'update' && query.agency_id !== undefined) {
    const agencyId = query.agency_id
    // Retired labels are available only for the authorized Agency retaining
    // that exact reference. One query keeps the reference and label coherent.
    selection = selection.where(eb => eb.or([
      eb('Common_GWCOA._deleted', '=', false),
      eb.exists(eb.selectFrom('Agency_Profile').select('Agency_Profile.id')
        .where('Agency_Profile.id', '=', agencyId)
        .where('Agency_Profile._deleted', '=', false)
        .whereRef('Agency_Profile.egcs_ay_gwcoa_number', '=', 'Common_GWCOA.egcs_cn_number'))
    ]))
  } else {
    selection = selection.where('_deleted', '=', false)
  }
  const gwcoa = await selection
    .select(['egcs_cn_number', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
    .executeTakeFirst()

  if (!gwcoa) return await notFound(event, 'GWCOA_NOT_FOUND', 'apiErrors.agency.gwcoa_not_found')
  return gwcoa
})
