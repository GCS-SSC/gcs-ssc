import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { accountReceivableTypeUsage } from '~~/server/utils/account-receivable-configuration'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const typeId = getRouterParam(event, 'typeId')
  if (!agencyId || !typeId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(typeId)) {
    return await notFound(event, 'ACCOUNT_RECEIVABLE_TYPE_NOT_FOUND', 'apiErrors.agency.account_receivable_type_not_found')
  }
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const type = await trx.selectFrom('Agency_Account_Receivable_Type')
      .where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId)
      .where('_deleted', '=', false).selectAll().select(accountReceivableTypeUsage()).executeTakeFirst()
    return type ?? await notFound(event, 'ACCOUNT_RECEIVABLE_TYPE_NOT_FOUND', 'apiErrors.agency.account_receivable_type_not_found')
  })
})
