import { sql } from 'kysely'
import { authorize } from '~~/server/utils/authorize'
import { resolveApplicantRecipientMutationPermissions, resolveApplicantRecipientVisibility, type ApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { forbidden } from '~~/server/utils/api-errors'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const ApplicantRecipientPaginationSchema = PaginationSchema.extend({
  agency_id: PositivePostgresBigintIdSchema.optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const context = await authorize<'read', ApplicantRecipientVisibility>(
    event,
    'applicant_recipient',
    'read',
    async ({ context: authContext }) => {
      const data = await resolveApplicantRecipientVisibility(authContext, 'read', db)
      if (data.hasGlobalAccess || data.agencyIds.length > 0) {
        return { bypass: true, data }
      }

      return { scope: { type: 'global' }, data }
    }
  )
  const visibility = context.data
  if (!visibility) {
    return await forbidden(event)
  }

  const { page, limit, search, status, agency_id } = await getValidatedQueryI18n(event, ApplicantRecipientPaginationSchema)
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Applicant_Recipient_Profile')
    .leftJoin('Agency_Applicant_Recipient_Subtype', join => join
      .onRef('Agency_Applicant_Recipient_Subtype.id', '=', 'Applicant_Recipient_Profile.egcs_ar_applicantrecipientsubtypes')
      .on('Agency_Applicant_Recipient_Subtype._deleted', '=', false))
    .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (!visibility.hasGlobalAccess) {
    baseQuery = baseQuery.where('Applicant_Recipient_Profile.egcs_ar_leadagency', 'in', visibility.agencyIds)
  }

  if (agency_id) {
    baseQuery = baseQuery.where('Applicant_Recipient_Profile.egcs_ar_leadagency', '=', agency_id)
  }

  if (status && status !== 'all') {
    baseQuery = baseQuery.where('Applicant_Recipient_Profile.egcs_ar_active', '=', status === 'active')
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb(sql<string>`CAST("Applicant_Recipient_Profile"."id" AS TEXT)`, 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_legalname_en', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_legalname_fr', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_operatingname_en', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_operatingname_fr', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ])
    )
  }

  let statsBaseQuery = db
    .selectFrom('Applicant_Recipient_Profile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)

  if (!visibility.hasGlobalAccess) {
    statsBaseQuery = statsBaseQuery.where('Applicant_Recipient_Profile.egcs_ar_leadagency', 'in', visibility.agencyIds)
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery
      .select([
        'Applicant_Recipient_Profile.id as id',
        'Applicant_Recipient_Profile.egcs_ar_description_en as egcs_ar_description_en',
        'Applicant_Recipient_Profile.egcs_ar_description_fr as egcs_ar_description_fr',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_en as egcs_ar_operatingname_en',
        'Applicant_Recipient_Profile.egcs_ar_operatingname_fr as egcs_ar_operatingname_fr',
        'Applicant_Recipient_Profile.egcs_ar_applicantrecipientsubtypes as egcs_ar_applicantrecipientsubtypes',
        'Applicant_Recipient_Profile.egcs_ar_leadagency as egcs_ar_leadagency',
        'Applicant_Recipient_Profile.egcs_ar_legalname_en as egcs_ar_legalname_en',
        'Applicant_Recipient_Profile.egcs_ar_legalname_fr as egcs_ar_legalname_fr',
        'Applicant_Recipient_Profile.egcs_ar_researchorganization_en as egcs_ar_researchorganization_en',
        'Applicant_Recipient_Profile.egcs_ar_researchorganization_fr as egcs_ar_researchorganization_fr',
        'Applicant_Recipient_Profile.egcs_ar_active as egcs_ar_active',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_en as subtype_name_en',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_name_fr as subtype_name_fr',
        'Agency_Applicant_Recipient_Subtype.egcs_ay_applicantrecipienttype as subtype_type',
        'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
        'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
      ])
      .orderBy('Applicant_Recipient_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Applicant_Recipient_Profile.id').as('total')).executeTakeFirst(),
    statsBaseQuery
      .select([
        eb => eb.fn.count('Applicant_Recipient_Profile.id').as('total'),
        eb => eb.fn.count(eb.case().when('Applicant_Recipient_Profile.egcs_ar_active', '=', true).then(1).else(null).end()).as('active')
      ])
      .executeTakeFirst()
  ])

  const permissions = await resolveApplicantRecipientMutationPermissions(context, items.map(item => String(item.id)), db)
  const itemsWithPermissions = items.map(item => {
    const itemId = String(item.id)
    const itemPermissions = permissions.get(itemId)

    return {
      ...item,
      can_update: itemPermissions?.canUpdate === true,
      can_delete: itemPermissions?.canDelete === true
    }
  })

  return {
    items: itemsWithPermissions,
    total: Number(countResult?.total || 0),
    stats: {
      total: Number(statsResult?.total || 0),
      active: Number(statsResult?.active || 0)
    },
    page,
    limit
  }
})
