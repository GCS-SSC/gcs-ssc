import { sql } from 'kysely'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  return await executeFreshReadSnapshot(event, async db => {
    const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db, { freshAuth: true })
    if (!agreementContext) {
      return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    }

    const agreement = await assertAgreementExists(event, agreementId, db)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const offset = (page - 1) * limit

    let baseQuery = db
      .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
      .innerJoin(
        'Applicant_Recipient_Profile',
        'Applicant_Recipient_Profile.id',
        'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient'
      )
      .leftJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
      .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
      .where('Applicant_Recipient_Profile._deleted', '=', false)
      .where(eb => eb.or([
        eb('Agency_Profile._deleted', '=', false),
        eb('Agency_Profile.id', 'is', null)
      ]))

    if (search) {
      const escapedSearch = escapeLikePattern(search)
      baseQuery = baseQuery.where(eb => eb.or([
        ...(isPositivePostgresBigintText(search)
          ? [eb('Funding_Case_Agreement_Applicant_Recipient.id', '=', search)]
          : []),
        eb('Applicant_Recipient_Profile.egcs_ar_legalname_en', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_legalname_fr', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_operatingname_en', 'ilike', `%${escapedSearch}%`),
        eb('Applicant_Recipient_Profile.egcs_ar_operatingname_fr', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Profile.egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
        eb('Agency_Profile.egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`)
      ]))
    }

    const [items, totalResult] = await Promise.all([
      baseQuery
        .select([
          'Funding_Case_Agreement_Applicant_Recipient.id as id',
          'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient as egcs_fc_applicantrecipient',
          sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_en", "Applicant_Recipient_Profile"."egcs_ar_operatingname_en")`.as('applicant_recipient_name_en'),
          sql<string | null>`COALESCE("Applicant_Recipient_Profile"."egcs_ar_legalname_fr", "Applicant_Recipient_Profile"."egcs_ar_operatingname_fr")`.as('applicant_recipient_name_fr'),
          'Agency_Profile.egcs_ay_name_en as lead_agency_name_en',
          'Agency_Profile.egcs_ay_name_fr as lead_agency_name_fr'
        ])
        .orderBy('Funding_Case_Agreement_Applicant_Recipient.id', 'asc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery.select(eb => eb.fn.count('Funding_Case_Agreement_Applicant_Recipient.id').as('total')).executeTakeFirst()
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
})
