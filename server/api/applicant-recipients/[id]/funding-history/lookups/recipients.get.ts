import { z } from 'zod'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import {
  resolveApplicantRecipientAuthorization,
  resolveApplicantRecipientVisibility
} from '~~/server/utils/applicant-recipient-auth'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'
import { isValidFundingHistoryId } from '~~/server/utils/funding-history-id'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create')
})

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')
  if (!isValidFundingHistoryId(applicantRecipientId)) return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid_id')

  const query = await getValidatedQueryI18n(event, QuerySchema)
  const { data: visibility } = await authorize(
    event,
    'applicant_recipient',
    query.permission_action,
    async ({ context }) => {
      const canAccessCurrent = await resolveApplicantRecipientAuthorization(
        context,
        applicantRecipientId,
        query.permission_action,
        db
      )
      const resolved = await resolveApplicantRecipientVisibility(context, query.permission_action, db)
      return 'bypass' in canAccessCurrent
        ? { bypass: true, data: resolved }
        : { denied: true, data: resolved }
    }
  )
  const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
  if (!profile || typeof profile !== 'object' || !('id' in profile)) return profile

  const offset = (query.page - 1) * query.limit
  let baseQuery = db
    .selectFrom('Applicant_Recipient_Profile')
    .where('_deleted', '=', false)
    .where('egcs_ar_active', '=', true)
  if (!visibility?.hasGlobalAccess) {
    if (!visibility?.agencyIds.length) {
      return { items: [], total: 0, stats: { total: 0, active: 0 }, page: query.page, limit: query.limit }
    }
    baseQuery = baseQuery.where('egcs_ar_leadagency', 'in', visibility.agencyIds)
  }
  if (query.search) {
    const search = escapeLikePattern(query.search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_ar_legalname_en', 'ilike', `%${search}%`),
      eb('egcs_ar_legalname_fr', 'ilike', `%${search}%`),
      eb('egcs_ar_operatingname_en', 'ilike', `%${search}%`),
      eb('egcs_ar_operatingname_fr', 'ilike', `%${search}%`)
    ]))
  }
  const [items, count] = await Promise.all([
    baseQuery
      .select([
        'id',
        'egcs_ar_legalname_en as label_en',
        'egcs_ar_legalname_fr as label_fr'
      ])
      .orderBy('id', 'asc')
      .limit(query.limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
  ])
  const total = Number(count?.total || 0)
  return { items, total, stats: { total, active: total }, page: query.page, limit: query.limit }
})
