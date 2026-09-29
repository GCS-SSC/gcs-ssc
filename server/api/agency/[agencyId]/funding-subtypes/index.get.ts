import { requireFundingAgency, withFundingAgencyRead } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'read', getRouterParam(event, 'agencyId'))
  return await withFundingAgencyRead(event, agencyId, async db => ({
    items: await db.selectFrom('Agency_Funding_Subtype as subtype')
      .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
      .select([
        'subtype.id', 'subtype.egcs_ay_fundingtype', 'subtype.egcs_ay_name_en', 'subtype.egcs_ay_name_fr',
        'subtype.egcs_ay_active', 'type.egcs_ay_name_en as type_name_en', 'type.egcs_ay_name_fr as type_name_fr',
        'type.egcs_ay_instacking', 'type.egcs_ay_incostsharing', 'type.egcs_ay_active as type_active'
      ])
      .where('type.egcs_ay_organizationagency', '=', agencyId)
      .where('type._deleted', '=', false).where('subtype._deleted', '=', false)
      .orderBy('type.egcs_ay_name_en').orderBy('subtype.egcs_ay_name_en').execute()
  }))
})
