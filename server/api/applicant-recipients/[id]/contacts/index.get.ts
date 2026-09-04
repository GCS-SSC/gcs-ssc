import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { APPLICANT_RECIPIENT_CONTACT_SELECT_COLUMNS } from '~~/server/utils/applicant-recipient-contact-columns'
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
    .selectFrom('Applicant_Recipient_Contact')
    .innerJoin('Common_Contact', 'Common_Contact.id', 'Applicant_Recipient_Contact.egcs_ar_contact')
    .where('Applicant_Recipient_Contact.egcs_ar_applicantrecipient', '=', applicantRecipientId)
    .where('Applicant_Recipient_Contact._deleted', '=', false)
    .where('Common_Contact._deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('Common_Contact.egcs_cn_name', 'ilike', `%${escapedSearch}%`),
      eb('Common_Contact.egcs_cn_email', 'ilike', `%${escapedSearch}%`),
      eb('Common_Contact.egcs_cn_jobtitle_en', 'ilike', `%${escapedSearch}%`),
      eb('Common_Contact.egcs_cn_jobtitle_fr', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery
      .select(APPLICANT_RECIPIENT_CONTACT_SELECT_COLUMNS)
      .orderBy('Applicant_Recipient_Contact.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Applicant_Recipient_Contact.id').as('total')).executeTakeFirst()
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
