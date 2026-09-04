import { sql } from 'kysely'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import {
  resolveApplicantRecipientVisibility,
  type ApplicantRecipientVisibility
} from '~~/server/utils/applicant-recipient-auth'
import { forbidden } from '~~/server/utils/api-errors'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const ApplicantRecipientLookupQuerySchema = PaginationSchema.extend({
  ids: z.union([
    PositivePostgresBigintIdSchema,
    z.array(PositivePostgresBigintIdSchema).max(100, { error: 'validation.max_items' })
  ]).optional()
})

/**
 * Normalizes optional query ids into a trimmed id array.
 *
 * @param value - Raw id query value.
 * @returns Trimmed applicant-recipient ids.
 */
const normalizeQueryIds = (value?: string | string[]) => {
  if (!value) {
    return []
  }

  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values.map(item => item.trim()).filter(item => item.length > 0))]
}

export default defineEventHandler(async event => {
  const db = event.context.$db

  const context = await authorize<'read', ApplicantRecipientVisibility>(event, 'applicant_recipient', 'read', async ({ context: authContext }) => {
    const visibility = await resolveApplicantRecipientVisibility(authContext, 'read', db)
    if (visibility.hasGlobalAccess || visibility.agencyIds.length > 0) {
      return { bypass: true, data: visibility }
    }
    return { scope: { type: 'global' }, data: visibility }
  })

  const { page, limit, search, ids } = await getValidatedQueryI18n(event, ApplicantRecipientLookupQuerySchema)
  const offset = (page - 1) * limit
  const selectedIds = normalizeQueryIds(ids)
  const visibility = context.data

  if (!visibility || (!visibility.hasGlobalAccess && visibility.agencyIds.length === 0)) {
    return await forbidden(event)
  }

  let baseQuery = db
    .selectFrom('Applicant_Recipient_Profile')
    .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where(eb => eb.or([
      eb('Agency_Profile._deleted', '=', false),
      eb('Agency_Profile.id', 'is', null)
    ]))
    .where(eb => selectedIds.length > 0
      ? eb.or([
          eb('Applicant_Recipient_Profile.egcs_ar_active', '=', true),
          eb('Applicant_Recipient_Profile.id', 'in', selectedIds)
        ])
      : eb('Applicant_Recipient_Profile.egcs_ar_active', '=', true))

  if (!visibility.hasGlobalAccess) {
    baseQuery = baseQuery.where('Applicant_Recipient_Profile.egcs_ar_leadagency', 'in', visibility.agencyIds)
  }

  if (selectedIds.length > 0) baseQuery = baseQuery.where('Applicant_Recipient_Profile.id', 'in', selectedIds)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb(sql<string>`CAST("Applicant_Recipient_Profile"."id" AS TEXT)`, 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_legalname_en', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_legalname_fr', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_operatingname_en', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_operatingname_fr', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Applicant_Recipient_Profile.id as id',
        sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('label_en'),
        sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('label_fr'),
        'Agency_Profile.egcs_ay_name_en as description_en',
        'Agency_Profile.egcs_ay_name_fr as description_fr'
      ])
      .orderBy('Applicant_Recipient_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Applicant_Recipient_Profile.id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)

  return {
    items,
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
