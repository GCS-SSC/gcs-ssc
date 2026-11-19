import { defineEventHandler, getRouterParam } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema, PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'

const RoleKey = z.string().regex(/^[1-9]\d{0,18}:(forward|reverse)$/, { error: 'validation.invalid_selection' })
const QuerySchema = PaginationSchema.extend({
  agency_id: PositivePostgresBigintIdSchema,
  permission_action: z.enum(['create', 'update']).default('create'),
  selected_ids: z.union([RoleKey, z.array(RoleKey).max(100)]).optional()
})

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  const id = getRouterParam(event, 'id') ?? ''
  const { page, limit, search, agency_id, permission_action, selected_ids } = await getValidatedQueryI18n(event, QuerySchema)
  await authorize(event, 'applicant_recipient', permission_action, async ({ context }) =>
    context.userAbilities.authorize('applicant_recipient', permission_action, { type: 'agency', agencyId: agency_id })
    && await canAccessApplicantRecipient(context, id, permission_action, db)
      ? { bypass: true }
      : { denied: true })

  const types = db.selectFrom('Agency_Proponent_Relationship_Type')
    .where('egcs_ay_organizationagency', '=', agency_id).where('_deleted', '=', false)
  const roles = types.select([
    sql<string>`id::text || ':forward'`.as('id'),
    'egcs_ay_name_en as label_en',
    'egcs_ay_name_fr as label_fr',
    'egcs_ay_code as code'
  ]).unionAll(types.where('egcs_ay_inverse_code', 'is not', null).select(eb => [
    sql<string>`id::text || ':reverse'`.as('id'),
    eb.fn.coalesce('egcs_ay_inverse_name_en', 'egcs_ay_name_en').as('label_en'),
    eb.fn.coalesce('egcs_ay_inverse_name_fr', 'egcs_ay_name_fr').as('label_fr'),
    eb.fn.coalesce('egcs_ay_inverse_code', 'egcs_ay_code').as('code')
  ]))
  let query = db.selectFrom(roles.as('roles'))
  if (selected_ids) query = query.where('id', 'in', Array.isArray(selected_ids) ? selected_ids : [selected_ids])
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('label_en', 'ilike', pattern),
      eb('label_fr', 'ilike', pattern),
      eb('code', 'ilike', pattern)
    ]))
  }
  const [rows, count] = await Promise.all([
    query.selectAll().orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
  ])
  const items = rows.map(row => ({
    id: row.id,
    label_en: `${row.label_en} (${row.code})`,
    label_fr: `${row.label_fr} (${row.code})`
  }))
  return { items, total: Number(count.total), page, limit }
}))
