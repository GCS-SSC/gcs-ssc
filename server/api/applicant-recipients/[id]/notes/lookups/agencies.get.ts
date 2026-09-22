import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { canAccessApplicantRecipient, resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'

const QuerySchema = PaginationSchema.extend({ permission_action: z.enum(['create', 'update']).default('create') })

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const db = event.context.$db
  await requireAuthContext(event)
  const { page, limit, search, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const result = await authorize(event, 'applicant_recipient', permission_action, async ({ context }) =>
    await canAccessApplicantRecipient(context, id, permission_action, db)
      ? { bypass: true as const, data: context }
      : { denied: true as const })
  const visibility = await resolveApplicantRecipientVisibility(result.data!, permission_action, db)
  let query = db.selectFrom('Agency_Profile').where('_deleted', '=', false).where('egcs_ay_active', '=', true)
  if (!visibility.hasGlobalAccess) query = query.where('id', 'in', visibility.agencyIds)
  if (search) query = query.where(eb => eb.or([
    eb('egcs_ay_name_en', 'ilike', `%${escapeLikePattern(search)}%`),
    eb('egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(search)}%`)
  ]))
  const [items, count] = await Promise.all([
    query.select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total ?? 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
