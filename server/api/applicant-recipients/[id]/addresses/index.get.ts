import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { APPLICANT_RECIPIENT_ADDRESS_SELECT_COLUMNS } from '~~/server/utils/applicant-recipient-address-columns'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')

  if (!applicantRecipientId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(applicantRecipientId)) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  await authorize(event, 'applicant_recipient', 'read', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'read', db)
  )
  const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
  if (!profile || typeof profile !== 'object' || !('id' in profile)) {
    return profile
  }

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Applicant_Recipient_Address')
    .innerJoin('Common_Address', 'Common_Address.id', 'Applicant_Recipient_Address.egcs_ar_address')
    .where('Applicant_Recipient_Address.egcs_ar_applicantrecipient', '=', applicantRecipientId)
    .where('Applicant_Recipient_Address._deleted', '=', false)
    .where('Common_Address._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Address.egcs_cn_addresscity', 'ilike', `%${escapedSearch}%`),
      eb('Common_Address.egcs_cn_addresssubdivision', 'ilike', `%${escapedSearch}%`),
      eb('Common_Address.egcs_cn_postalcodezipcode', 'ilike', `%${escapedSearch}%`),
      eb('Common_Address.egcs_cn_street1', 'ilike', `%${escapedSearch}%`),
      eb('Common_Address.egcs_cn_street2', 'ilike', `%${escapedSearch}%`),
      eb('Common_Address.egcs_cn_street3', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery
      .select(APPLICANT_RECIPIENT_ADDRESS_SELECT_COLUMNS)
      .orderBy('Applicant_Recipient_Address.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Applicant_Recipient_Address.id').as('total')).executeTakeFirst()
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
