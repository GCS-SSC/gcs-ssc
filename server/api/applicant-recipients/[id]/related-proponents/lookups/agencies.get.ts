import { defineEventHandler, getRouterParam } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { canAccessApplicantRecipient, resolveApplicantRecipientVisibility } from '~~/server/utils/applicant-recipient-auth'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { PaginationSchema } from '~~/shared/types/schemas'

export default defineEventHandler(async event => await executeFreshReadSnapshot(event, async db => {
  const id = getRouterParam(event, 'id') ?? ''
  const context = await authorize(event, 'applicant_recipient', 'create', async ({ context }) =>
    await canAccessApplicantRecipient(context, id, 'create', db) ? { bypass: true } : { denied: true })
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const visibility = await resolveApplicantRecipientVisibility(context, 'create', db)
  let query = db.selectFrom('Agency_Profile').where('_deleted', '=', false).where('egcs_ay_active', '=', true)
  if (!visibility.hasGlobalAccess) query = query.where('id', 'in', visibility.agencyIds)
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`
    query = query.where(eb => eb.or([
      eb('egcs_ay_name_en', 'ilike', pattern),
      eb('egcs_ay_name_fr', 'ilike', pattern)
    ]))
  }
  const [items, count] = await Promise.all([
    query.select(['id', 'egcs_ay_name_en as label_en', 'egcs_ay_name_fr as label_fr'])
      .orderBy('id').limit(limit).offset((page - 1) * limit).execute(),
    query.select(eb => eb.fn.count('id').as('total')).executeTakeFirstOrThrow()
  ])
  return { items, total: Number(count.total), page, limit }
}))
