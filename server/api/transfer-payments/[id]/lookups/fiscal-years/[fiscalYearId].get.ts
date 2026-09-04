import { authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { authorizeTransferPaymentProfileResource, createTransferPaymentScopedAuthorizeHandler } from '~~/server/utils/transfer-payment-route-authorization'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  const fiscalYearId = getRouterParam(event, 'fiscalYearId')
  if (!profileId || !fiscalYearId) {
    return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  }

  const access = await authorizeTransferPaymentProfileResource(event, 'read', profileId)
  if (!access) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }
  if (!isPositivePostgresBigintText(fiscalYearId)) {
    return await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
  }

  const fiscalYear = await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const authContext = await requireFreshAuthContext(event, trx)
    await authorizeWithFreshAuthContext(
      event,
      authContext,
      'transfer_payment',
      'read',
      createTransferPaymentScopedAuthorizeHandler('read', { type: 'agency', agencyId: access.agencyId }, trx)
    )
    return await trx.selectFrom('Agency_Fiscal_Year')
      .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Agency_Fiscal_Year.egcs_ay_organizationagency')
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.egcs_tp_agency',
        'Agency_Profile.id'
      )
      .where('Agency_Fiscal_Year.id', '=', fiscalYearId)
      .where('Transfer_Payment_Profile.id', '=', profileId)
      .where('Agency_Fiscal_Year.egcs_ay_organizationagency', '=', access.agencyId)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .where('Agency_Profile._deleted', '=', false)
      .where('Agency_Fiscal_Year._deleted', '=', false)
      .select([
        'Agency_Fiscal_Year.id as id',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as egcs_ay_fiscalyeardisplay',
        'Agency_Fiscal_Year.egcs_ay_fiscalyear as egcs_ay_fiscalyear'
      ])
      .executeTakeFirst()
  })

  if (!fiscalYear) {
    return await notFound(event, 'FISCAL_YEAR_NOT_FOUND', 'apiErrors.agency.fiscal_year_not_found')
  }

  return {
    ...fiscalYear,
    id: String(fiscalYear.id)
  }
})
