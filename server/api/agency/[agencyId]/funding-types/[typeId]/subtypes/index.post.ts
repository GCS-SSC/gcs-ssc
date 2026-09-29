import { AgencyFundingSubtypeBaseSchema } from '~~/shared/types/schemas/funding-sources'
import { requireFundingAgency, requireFundingType, withFundingAgencyWrite } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'create', getRouterParam(event, 'agencyId'))
  const typeId = getRouterParam(event, 'typeId')
  const body = await readValidatedBodyI18n(event, AgencyFundingSubtypeBaseSchema)
  return await withFundingAgencyWrite(event, agencyId, async db => {
    await requireFundingType(event, db, agencyId, typeId)
    return await db.insertInto('Agency_Funding_Subtype').values({ ...body, egcs_ay_fundingtype: typeId! })
      .returningAll().executeTakeFirstOrThrow()
  })
})
