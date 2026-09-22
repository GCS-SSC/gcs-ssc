import { authorize, resolveAnyAgency } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { escapeLikePattern } from '~~/server/utils/sql-like'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const access = await authorize(event, 'group', 'read', resolveAnyAgency(db))
  const { page, limit, search, agency } = await getValidatedQueryI18n(event, PaginationSchema.extend({
    agency: PositivePostgresBigintIdSchema.optional()
  }))
  const agencyIds = access.agencyIds ?? []
  const base = db.selectFrom('Common_Group')
    .where('Common_Group._deleted', '=', false)
    .$if(!access.hasGlobalAccess, query => query.where('Common_Group.egcs_cn_agency', 'in', agencyIds))
    .$if(Boolean(agency), query => query.where('Common_Group.egcs_cn_agency', '=', agency!))
    .$if(Boolean(search), query => query.where(eb => eb.or([
      eb('Common_Group.egcs_cn_name_en', 'ilike', `%${escapeLikePattern(search ?? '')}%`),
      eb('Common_Group.egcs_cn_name_fr', 'ilike', `%${escapeLikePattern(search ?? '')}%`),
      eb('Common_Group.egcs_cn_email', 'ilike', `%${escapeLikePattern(search ?? '')}%`)
    ])))
  const [items, count] = await Promise.all([
    base.selectAll().orderBy('Common_Group.egcs_cn_name_en').limit(limit).offset((page - 1) * limit).execute(),
    base.select(eb => eb.fn.count('Common_Group.id').as('total')).executeTakeFirstOrThrow()
  ])
  return { items: items.map(group => ({ ...group, id: String(group.id), egcs_cn_agency: String(group.egcs_cn_agency) })), total: Number(count.total), stats: { total: Number(count.total) }, page, limit }
})
