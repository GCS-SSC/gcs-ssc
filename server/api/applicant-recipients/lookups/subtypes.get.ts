import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'
import { canAccessApplicantRecipient, resolveApplicantRecipientVisibility, type ApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'

const QuerySchema = PaginationSchema.extend({
  agency_id: z.coerce.string().optional(),
  applicant_recipient_id: z.coerce.string().optional(),
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const {
    page,
    limit,
    search,
    agency_id,
    applicant_recipient_id,
    permission_action
  } = await getValidatedQueryI18n(event, QuerySchema)
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

  let baseQuery = db
    .selectFrom('Agency_Applicant_Recipient_Subtype')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Applicant_Recipient_Subtype.egcs_ay_organizationagency')
    .where('Agency_Applicant_Recipient_Subtype._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (!visibility.hasGlobalAccess) {
    baseQuery = baseQuery.where('Agency_Profile.id', 'in', visibility.agencyIds)
  }

  if (agency_id) {
    baseQuery = baseQuery.where('Agency_Applicant_Recipient_Subtype.egcs_ay_organizationagency', '=', agency_id)
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Agency_Applicant_Recipient_Subtype.id as id',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_en as egcs_ay_name_en',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr as egcs_ay_name_fr',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_applicantrecipienttype as egcs_ay_applicantrecipienttype',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_organizationagency as agency_id',
        'Agency_Profile.egcs_ay_name_en as agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as agency_name_fr'
      ])
      .orderBy('Agency_Applicant_Recipient_Subtype.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Agency_Applicant_Recipient_Subtype.id').as('total')).executeTakeFirst()
  ])

  return {
    items,
    total: Number(countResult?.total || 0),
    stats: { total: Number(countResult?.total || 0) },
    page,
    limit
  }
})
