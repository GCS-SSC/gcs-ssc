import { requireFundingAgency, requireFundingType, requireFundingSubtype, withFundingAgencyWrite } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'delete', getRouterParam(event, 'agencyId'))
  const typeId = getRouterParam(event, 'typeId')
  const subtypeId = getRouterParam(event, 'subtypeId')
  return await withFundingAgencyWrite(event, agencyId, async db => {
    await requireFundingType(event, db, agencyId, typeId)
    await requireFundingSubtype(event, db, typeId!, subtypeId)
    const link = await db.selectFrom('Transfer_Payment_Stream_Funding_Subtype').select('id')
      .where('egcs_tp_fundingsubtype', '=', subtypeId!).where('_deleted', '=', false).executeTakeFirst()
    if (link) return await throwApiError(event, { statusCode: 409, code: 'FUNDING_SUBTYPE_IN_USE', key: 'apiErrors.request.resource_in_use' })
    await db.updateTable('Agency_Funding_Subtype').set({ _deleted: true, egcs_ay_active: false }).where('id', '=', subtypeId!).execute()
    return { success: true }
  }, 'delete')
})
