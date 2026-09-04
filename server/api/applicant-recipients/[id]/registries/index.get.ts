import { sql } from 'kysely'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!applicantRecipientId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(applicantRecipientId)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')

  await authorize(event, 'applicant_recipient', 'read', async ({ context }) =>
    await resolveApplicantRecipientAuthorization(context, applicantRecipientId, 'read', db)
  )
  const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
  if (!profile || typeof profile !== 'object' || !('id' in profile)) return profile

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const offset = (page - 1) * limit
  let baseQuery = db
    .selectFrom('Applicant_Recipient_Registry')
    .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
    .where('_deleted', '=', false)

  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_ar_number', 'ilike', `%${escapedSearch}%`),
      eb(sql<string>`CAST(egcs_ar_registry AS TEXT)`, 'ilike', `%${escapedSearch}%`),
      eb('egcs_ar_othercomment', 'ilike', `%${escapedSearch}%`)
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery.select(['id', 'egcs_ar_number', 'egcs_ar_registry', 'egcs_ar_othercomment'])
      .orderBy('id', 'asc').limit(limit).offset(offset).execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  const total = Number(totalResult?.total || 0)
  return { items, total, stats: { total, active: total }, page, limit }
})
