import { requireFundingAgency, requireFundingType, withFundingAgencyWrite } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'delete', getRouterParam(event, 'agencyId'))
  const typeId = getRouterParam(event, 'typeId')
  return await withFundingAgencyWrite(event, agencyId, async db => {
    await requireFundingType(event, db, agencyId, typeId)
    const inUse = await db.selectFrom('Agency_Funding_Subtype as subtype')
      .innerJoin('Transfer_Payment_Stream_Funding_Subtype as link', 'link.egcs_tp_fundingsubtype', 'subtype.id')
      .select('link.id').where('subtype.egcs_ay_fundingtype', '=', typeId!).where('link._deleted', '=', false)
      .executeTakeFirst()
    if (inUse) return await throwApiError(event, { statusCode: 409, code: 'FUNDING_TYPE_IN_USE', key: 'apiErrors.request.resource_in_use' })
    await db.updateTable('Agency_Funding_Type').set({ _deleted: true, egcs_ay_active: false }).where('id', '=', typeId!).execute()
    await db.updateTable('Agency_Funding_Subtype').set({ _deleted: true, egcs_ay_active: false }).where('egcs_ay_fundingtype', '=', typeId!).execute()
    return { success: true }
  }, 'delete')
})
