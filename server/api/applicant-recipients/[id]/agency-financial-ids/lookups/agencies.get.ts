import { defineEventHandler, getRouterParam } from 'h3'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { assertApplicantRecipientProfileExists } from '~~/server/utils/applicant-recipient-child-resources'
import { resolveApplicantRecipientAuthorization } from '~~/server/utils/applicant-recipient-auth'
import { z } from 'zod'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const QuerySchema = PaginationSchema.extend({
  permission_action: z.enum(['create', 'update']).default('create'),
  selected_id: z.preprocess(value => value === '' ? undefined : value, PositivePostgresBigintIdSchema.optional())
})
const AuthorizationQuerySchema = QuerySchema.omit({ selected_id: true })
const SelectedAgencyQuerySchema = QuerySchema.pick({ selected_id: true })

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const applicantRecipientId = getRouterParam(event, 'id')

  if (!applicantRecipientId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const { page, limit, search, permission_action } = await getValidatedQueryI18n(event, AuthorizationQuerySchema)
  await authorize(event, 'applicant_recipient', permission_action, async ({ context: authContext }) =>
    await resolveApplicantRecipientAuthorization(authContext, applicantRecipientId, permission_action, db)
  )
  const { selected_id } = await getValidatedQueryI18n(event, SelectedAgencyQuerySchema)
  const profile = await assertApplicantRecipientProfileExists(event, applicantRecipientId, db)
  if (!profile || typeof profile !== 'object' || !('id' in profile)) {
    return profile
  }
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Agency_Profile')
    .where('_deleted', '=', false)
    .where(eb => selected_id
      ? eb.or([
          eb('egcs_ay_active', '=', true),
          eb('id', '=', selected_id)
        ])
      : eb('egcs_ay_active', '=', true))

  const searchId = search && isPositivePostgresBigintText(search) ? search : undefined
  if (search) {
    const escapedSearch = escapeLikePattern(search)
    baseQuery = baseQuery.where(eb => eb.or([
      eb('egcs_ay_name_en', 'ilike', `%${escapedSearch}%`),
      eb('egcs_ay_name_fr', 'ilike', `%${escapedSearch}%`),
      ...(searchId ? [eb('id', '=', searchId)] : [])
    ]))
  }

  const [items, totalResult] = await Promise.all([
    baseQuery
      .select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr'])
      .orderBy(eb => searchId
        ? eb.case().when('id', '=', searchId).then(0).else(1).end()
        : eb.val(0))
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('id').as('total')).executeTakeFirst()
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
