import { z } from 'zod'
import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { requireAuthContext } from '~~/server/utils/authorize'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create'),
  relationship_id: z.string().optional()
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const { page, limit, search, permission_action, relationship_id } = await getValidatedQueryI18n(event, QuerySchema)
  const agreementContext = await authorizeAgreementResource(event, permission_action, agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const offset = (page - 1) * limit
  const authContext = await requireAuthContext(event)

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const proponentVisibility = await resolveApplicantRecipientVisibility(authContext, 'read', db)
  if (!proponentVisibility.hasGlobalAccess && proponentVisibility.agencyIds.length === 0) {
    return {
      items: [],
      total: 0,
      stats: { total: 0, active: 0 },
      page,
      limit
    }
  }

  let baseQuery = db
    .selectFrom('Applicant_Recipient_Profile')
    .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Applicant_Recipient_Profile.egcs_ar_active', '=', true)
    .where(eb => eb.or([
      eb('Agency_Profile._deleted', '=', false),
      eb('Agency_Profile.id', 'is', null)
    ]))

  const linkedApplicantRecipients = db.selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .select('egcs_fc_applicantrecipient')
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .$if(Boolean(relationship_id && isPositivePostgresBigintText(relationship_id)), query =>
      query.where('id', '!=', relationship_id!))
  baseQuery = baseQuery.where('Applicant_Recipient_Profile.id', 'not in', linkedApplicantRecipients)

  if (!proponentVisibility.hasGlobalAccess) {
    baseQuery = baseQuery.where('Applicant_Recipient_Profile.egcs_ar_leadagency', 'in', proponentVisibility.agencyIds)
  }

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      ...(isPositivePostgresBigintText(search)
        ? [eb('Applicant_Recipient_Profile.id', '=', search)]
        : []),
      eb('Applicant_Recipient_Profile.egcs_ar_legalname_en', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_legalname_fr', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_operatingname_en', 'ilike', `%${escapedSearch}%`),
      eb('Applicant_Recipient_Profile.egcs_ar_operatingname_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery
      .select([
        'Applicant_Recipient_Profile.id as id',
        sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('label_en'),
        sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('label_fr')
      ])
      .orderBy('Applicant_Recipient_Profile.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Applicant_Recipient_Profile.id').as('total')).executeTakeFirst()
  ])

  const total = Number(totalResult?.total || 0)

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
