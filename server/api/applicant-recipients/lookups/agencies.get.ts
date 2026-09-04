import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { canAccessApplicantRecipient, resolveApplicantRecipientVisibility, type ApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { z } from 'zod'

const QuerySchema = PaginationSchema.extend({
  applicant_recipient_id: z.coerce.string().optional(),
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const { page, limit, search, applicant_recipient_id, permission_action } = await getValidatedQueryI18n(event, QuerySchema)
  const access = await authorize<'create' | 'update', ApplicantRecipientVisibility>(event, 'applicant_recipient', permission_action, async ({ context }) => {
    const data = await resolveApplicantRecipientVisibility(context, permission_action, db)
    if (
      permission_action === 'update'
      && applicant_recipient_id
      && await canAccessApplicantRecipient(context, applicant_recipient_id, 'update', db)
    ) {
      return { bypass: true, data }
    }
    if (data.hasGlobalAccess || data.agencyIds.length > 0) return { bypass: true, data }
    return { scope: { type: 'global' }, data }
  })
  const visibility = access.data!
  const offset = (page - 1) * limit
  const currentLeadAgencyId = permission_action === 'update' && applicant_recipient_id
    ? await db
        .selectFrom('Applicant_Recipient_Profile')
        .where('id', '=', applicant_recipient_id)
        .where('_deleted', '=', false)
        .select('egcs_ar_leadagency')
        .executeTakeFirst()
        .then(row => row?.egcs_ar_leadagency ? String(row.egcs_ar_leadagency) : undefined)
    : undefined

  if (!visibility.hasGlobalAccess && visibility.agencyIds.length === 0) {
    return { items: [], total: 0, stats: { total: 0 }, page, limit }
  }

  let baseQuery = db
    .selectFrom('Agency_Profile')
    .where('_deleted', '=', false)
    .where(eb => currentLeadAgencyId
      ? eb.or([
          eb('egcs_ay_active', '=', true),
          eb('id', '=', currentLeadAgencyId)
        ])
      : eb('egcs_ay_active', '=', true))

  if (!visibility.hasGlobalAccess) {
    baseQuery = baseQuery.where('id', 'in', visibility.agencyIds)
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])

  return {
    items,
    total: Number(countResult?.total || 0),
    stats: { total: Number(countResult?.total || 0) },
    page,
    limit
  }
})
