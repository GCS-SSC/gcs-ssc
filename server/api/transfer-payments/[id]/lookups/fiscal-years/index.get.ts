import { sql } from 'kysely'
import { PaginationSchema } from '~~/shared/types/schemas'
import { escapeLikePattern } from '~~/server/utils/sql-like'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }

  const query = await getValidatedQueryI18n(event, PaginationSchema)
  const { page, limit, search } = query
  const offset = (page - 1) * limit

  let baseQuery = db
    .selectFrom('Agency_Fiscal_Year')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Fiscal_Year.egcs_ay_organizationagency')
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.egcs_tp_agency',
      'Agency_Profile.id'
    )
    .where('Transfer_Payment_Profile.id', '=', profileId)
    .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', access.agencyId)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .where('Agency_Fiscal_Year._deleted', '=', false)

  if (search) {
    baseQuery = baseQuery.where(eb =>
      eb.or([
        eb('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay', 'ilike', `%${escapeLikePattern(search)}%`),
        eb(
          sql<string>`CAST(${eb.ref('Agency_Fiscal_Year.egcs_ay_fiscalyear')} AS TEXT)`,
          'ilike',
          `%${escapeLikePattern(search)}%`
        )
      ])
    )
  }

  const [items, countResult] = await Promise.all([
    baseQuery
      .select([
        'Agency_Fiscal_Year.id as id',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as egcs_ay_fiscalyeardisplay',
        'Agency_Fiscal_Year.egcs_ay_fiscalyear as egcs_ay_fiscalyear'
      ])
      .orderBy('Agency_Fiscal_Year.id', 'asc')
      .limit(limit)
      .offset(offset)
      .execute(),
    baseQuery
      .select(eb => eb.fn.count('Agency_Fiscal_Year.id').as('total'))
      .executeTakeFirst()
  ])

  const total = countResult ? Number(countResult.total) : 0

  return {
    items: items.map(item => ({
      ...item,
      id: String(item.id)
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
