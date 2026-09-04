import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'

/** Lists active fiscal-year budgets scoped to the requested transfer payment and agency. */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
  if (!access) return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  const agencyId = access.agencyId
  const resolvedProfileId = profileId

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Transfer_Payment_Fiscal_Year_Budget')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile'
    )
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
    .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile', '=', resolvedProfileId)
    .where('Transfer_Payment_Profile.egcs_tp_agency', '=', agencyId)
    .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', agencyId)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapeLikePattern(search)}%`),
        eb(sql<string>`CAST(${sql.ref('Agency_Fiscal_Year.egcs_ay_fiscalyear')} AS TEXT)`, 'ilike', `%${escapeLikePattern(search)}%`)
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Transfer_Payment_Fiscal_Year_Budget.id as id',
        'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_transferpaymentprofile as egcs_tp_transferpaymentprofile',
        'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear as egcs_tp_fiscalyear',
        databaseMoneyText(sql.ref('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_totalbudget')).as('egcs_tp_totalbudget'),
        'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_overcommitthreshold as egcs_tp_overcommitthreshold',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
        'Agency_Fiscal_Year.egcs_ay_fiscalyear as fiscal_year'
      ])
      .orderBy('Transfer_Payment_Fiscal_Year_Budget.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery.select(eb => eb.fn.count('Transfer_Payment_Fiscal_Year_Budget.id').as('total')).executeTakeFirst()
  ])

  const total = Number(countResult?.total || 0)

  return {
    items: items.map(item => ({
      ...item,
      id: String(item.id),
      egcs_tp_transferpaymentprofile: String(item.egcs_tp_transferpaymentprofile),
      egcs_tp_fiscalyear: String(item.egcs_tp_fiscalyear),
      egcs_tp_totalbudget: parseDatabaseMoney(item.egcs_tp_totalbudget)
    })),
    total,
    stats: {
      total,
      active: total
    },
    page,
    limit
  }
})
