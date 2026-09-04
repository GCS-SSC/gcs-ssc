import { sql } from 'kysely'
import { authorize, requireAuthContext } from '~~/server/utils/authorize'
import { AdminCommonListQuerySchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { selectActiveStructuralRoleIds } from '~~/server/utils/active-user-scopes'

type CountResult = { total?: number | string }
type StatsResult = { total?: number | string, active?: number | string }
type AdminCommonUserListQuery = {
  page: number
  limit: number
  search?: string
  status?: string
  deleted?: boolean
}

/**
 * Applies the shared list search filter to a user query builder.
 *
 * @param query - Base Kysely query.
 * @param query.where - Query-builder `where` callback entrypoint.
 * @param search - User-provided search term.
 * @param columnPrefix - Optional alias prefix for qualified column references.
 * @returns The filtered query.
 */
const applyUserSearchFilter = <
  TQuery extends {
    where: (
      callback: (eb: {
        or: (conditions: unknown[]) => unknown
        (column: unknown, operator: string, value: string): unknown
      }) => unknown
    ) => TQuery
  }
>(
  query: TQuery,
  search: string,
  columnPrefix = ''
): TQuery => {
  const escapedSearch = escapeLikePattern(search)
  const qualifyColumn = (column: string) => `${columnPrefix}${column}`

  return query.where(eb => eb.or([
    eb(sql<string>`CAST(${sql.ref(qualifyColumn('id'))} AS TEXT)`, 'ilike', `%${escapedSearch}%`),
    eb(qualifyColumn('egcs_cn_name'), 'ilike', `%${escapedSearch}%`),
    eb(qualifyColumn('egcs_cn_email'), 'ilike', `%${escapedSearch}%`)
  ]))
}

/**
 * Resolves the deleted filter from explicit and status-based list parameters.
 *
 * @param query - Validated admin common list query.
 * @returns Deleted filter value, or undefined when all rows should be included.
 */
const resolveUserDeletedFilter = (query: AdminCommonUserListQuery): boolean | undefined => {
  if (query.deleted !== undefined) {
    return query.deleted
  }

  if (query.status === 'deleted') {
    return true
  }

  if (query.status === 'active') {
    return false
  }

  return undefined
}

/**
 * Builds the common-user list route response.
 *
 * @param items - Page of user rows.
 * @param countResult - Filtered count query result.
 * @param statsResult - Unfiltered stats query result.
 * @param page - Current page number.
 * @param limit - Page size.
 * @returns Normalized list route response.
 */
const buildCommonUserListResponse = (
  items: unknown[],
  countResult: CountResult | undefined,
  statsResult: StatsResult | undefined,
  page: number,
  limit: number
) => ({
  items,
  total: Number(countResult?.total ?? 0),
  stats: {
    total: Number(statsResult?.total ?? 0),
    active: Number(statsResult?.active ?? 0)
  },
  page,
  limit
})

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const db = event.context.$db
  const query = await getValidatedQueryI18n(event, AdminCommonListQuerySchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let agencyId: string | undefined
  const scopedLookup = query.approvalTemplateId
    ? { kind: 'approval_template' as const, id: query.approvalTemplateId }
    : query.workflowSetupId
      ? { kind: 'workflow_setup' as const, id: query.workflowSetupId }
      : null
  if (scopedLookup) {
    const { data: authorizedAgencyId } = await authorize(
      event,
      'user',
      'read',
      async () => {
        const templateScope = scopedLookup.kind === 'approval_template'
          ? await db
              .selectFrom('Common_Approval_Template')
              .innerJoin(
                'Transfer_Payment_Stream',
                'Transfer_Payment_Stream.id',
                'Common_Approval_Template.egcs_cn_scopeid'
              )
              .innerJoin(
                'Transfer_Payment_Profile',
                'Transfer_Payment_Profile.id',
                'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
              )
              .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
              .where('Common_Approval_Template.id', '=', scopedLookup.id)
              .where('Common_Approval_Template.egcs_cn_scopetype', '=', 'transferpaymentstream')
              .where('Common_Approval_Template._deleted', '=', false)
              .where('Transfer_Payment_Stream._deleted', '=', false)
              .where('Transfer_Payment_Profile._deleted', '=', false)
              .executeTakeFirst()
          : await db
              .selectFrom('Common_Workflow_Setup')
              .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Common_Workflow_Setup.egcs_cn_scopeid')
              .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
              .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
              .where('Common_Workflow_Setup.id', '=', scopedLookup.id)
              .where('Common_Workflow_Setup.egcs_cn_scopetype', '=', 'transferpaymentstream')
              .where('Common_Workflow_Setup._deleted', '=', false)
              .where('Transfer_Payment_Stream._deleted', '=', false)
              .where('Transfer_Payment_Profile._deleted', '=', false)
              .executeTakeFirst()

        if (!templateScope) {
          return await notFound(
            event,
            scopedLookup.kind === 'workflow_setup' ? 'WORKFLOW_SETUP_NOT_FOUND' : 'TRANSFER_PAYMENT_APPROVAL_TEMPLATE_NOT_FOUND',
            scopedLookup.kind === 'workflow_setup' ? 'apiErrors.admin_common.not_found' : 'apiErrors.transfer_payment.approval_template_not_found'
          )
        }

        const templateAgencyId = String(templateScope.agencyId)
        return {
          scope: { type: 'agency' as const, agencyId: templateAgencyId },
          data: templateAgencyId
        }
      }
    )
    agencyId = authorizedAgencyId
  } else {
    await authorize(event, 'system', 'read', { type: 'global' })
  }

  let baseQuery = db.selectFrom('Common_User')
  let statsQuery = db.selectFrom('Common_User as Common_User_Stats')

  if (agencyId) {
    baseQuery = baseQuery
      .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
      .innerJoin('user_role_assignment', 'user_role_assignment.user_id', 'user.id')
      .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
      .where('user._deleted', '=', false)
      .where('user_role_assignment._deleted', '=', false)
      .where('role.id', 'in', selectActiveStructuralRoleIds(db))
      .where('role.agency_id', '=', agencyId)

    statsQuery = statsQuery
      .innerJoin('user', 'user.id', 'Common_User_Stats.egcs_cn_auth_user_id')
      .innerJoin('user_role_assignment', 'user_role_assignment.user_id', 'user.id')
      .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
      .where('user._deleted', '=', false)
      .where('user_role_assignment._deleted', '=', false)
      .where('role.id', 'in', selectActiveStructuralRoleIds(db))
      .where('role.agency_id', '=', agencyId)
  }

  const deletedFilter = resolveUserDeletedFilter(query)

  if (deletedFilter !== undefined) {
    baseQuery = baseQuery.where('Common_User._deleted', '=', deletedFilter)
  }

  if (search) {
    baseQuery = applyUserSearchFilter(baseQuery, search, 'Common_User.')
    statsQuery = applyUserSearchFilter(statsQuery, search, 'Common_User_Stats.')
  }

  const [items, countResult, statsResult] = await Promise.all([
    baseQuery
      .select([
        'Common_User.id as id',
        'Common_User.egcs_cn_name as egcs_cn_name',
        // Common_User currently stores a single non-localized name field; keep exposing
        // the standard bilingual shape until separate EN/FR columns exist.
        'Common_User.egcs_cn_name as egcs_cn_name_en',
        'Common_User.egcs_cn_name as egcs_cn_name_fr',
        'Common_User.egcs_cn_email as egcs_cn_email',
        'Common_User._deleted as _deleted'
      ])
      .distinctOn('Common_User.id')
      .orderBy('Common_User.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(sql<number>`count(DISTINCT "Common_User"."id")`.as('total')).executeTakeFirst(),
    statsQuery
      .select([
        sql<number>`count(DISTINCT "Common_User_Stats"."id")`.as('total'),
        sql<number>`count(DISTINCT CASE WHEN "Common_User_Stats"."_deleted" = false THEN "Common_User_Stats"."id" END)`.as('active')
      ])
      .executeTakeFirst()
  ])

  return buildCommonUserListResponse(
    items,
    countResult as CountResult | undefined,
    statsResult as StatsResult | undefined,
    page,
    limit
  )
})
