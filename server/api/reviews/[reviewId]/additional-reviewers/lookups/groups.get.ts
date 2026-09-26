import { z } from 'zod'
import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import { requireAuthContext } from '~~/server/utils/authorize'
import { resolveAdditionalReviewerExecutableContextFromReview } from '~~/server/utils/additional-reviewer-runtime'
import { authorizeReviewRuntimeAction } from '~~/server/utils/review-runtime-access'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { escapeLikePattern } from '~~/server/utils/sql-like'

const GroupLookupQuerySchema = PaginationSchema.extend({ search: z.string().optional() })

export default defineEventHandler(async event => {
  const db = event.context.$db
  await requireAuthContext(event)
  const reviewId = getRouterParam(event, 'reviewId')
  if (!reviewId) return await badRequest(event, 'MISSING_REVIEW_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(reviewId)) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const { page, limit, search } = await getValidatedQueryI18n(event, GroupLookupQuerySchema)
  const context = await resolveAdditionalReviewerExecutableContextFromReview(db, reviewId)
  if (!context?.runtimeEntity.schemaAgencyId) {
    return await notFound(event, 'ASSESSMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  await authorizeReviewRuntimeAction(event, 'save_assessment', context.runtimeEntity)

  return await db.transaction().setIsolationLevel('repeatable read').setAccessMode('read only').execute(async trx => {
    let query = trx.selectFrom('Common_Group')
      .where('Common_Group.egcs_cn_agency', '=', context.runtimeEntity.schemaAgencyId)
      .where('Common_Group._deleted', '=', false)
      .where(eb => eb.exists(eb.selectFrom('Common_Group_Member')
        .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
        .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
        .select('Common_Group_Member.id')
        .whereRef('Common_Group_Member.egcs_cn_group', '=', 'Common_Group.id')
        .where('Common_Group_Member._deleted', '=', false)
        .where('Common_User._deleted', '=', false)
        .where('user._deleted', '=', false)))

    // The shared select resolves an off-page single value with search=<selected id>&limit=1.
    // Include an exact eligible ID and order it first so numeric names cannot hide it.
    const selectedId = search && isPositivePostgresBigintText(search) ? search : null
    if (search) {
      const pattern = `%${escapeLikePattern(search)}%`
      query = query.where(eb => eb.or([
        eb('Common_Group.egcs_cn_name_en', 'ilike', pattern),
        eb('Common_Group.egcs_cn_name_fr', 'ilike', pattern),
        ...(selectedId ? [eb('Common_Group.id', '=', selectedId)] : [])
      ]))
    }

    const itemsQuery = query.select(['Common_Group.id', 'Common_Group.egcs_cn_name_en', 'Common_Group.egcs_cn_name_fr'])
    const orderedItemsQuery = selectedId
      ? itemsQuery.orderBy(sql<number>`case when "Common_Group"."id" = ${selectedId} then 0 else 1 end`)
      : itemsQuery
    const [groups, count] = await Promise.all([
      orderedItemsQuery
        .orderBy('Common_Group.egcs_cn_name_en')
        .orderBy('Common_Group.id')
        .limit(limit).offset((page - 1) * limit).execute(),
      query.select(eb => eb.fn.count('Common_Group.id').as('total')).executeTakeFirst()
    ])
    const total = Number(count?.total ?? 0)
    return {
      items: groups.map(group => ({ ...group, id: String(group.id) })),
      total,
      stats: { total, active: total },
      page,
      limit
    }
  })
})
