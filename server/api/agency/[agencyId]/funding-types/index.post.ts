import { AgencyFundingTypeBaseSchema } from '~~/shared/types/schemas/funding-sources'
import { requireFundingAgency, withFundingAgencyWrite } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'create', getRouterParam(event, 'agencyId'))
  const body = await readValidatedBodyI18n(event, AgencyFundingTypeBaseSchema)
  return await withFundingAgencyWrite(event, agencyId, async db => await db.insertInto('Agency_Funding_Type')
    .values({ ...body, egcs_ay_organizationagency: agencyId }).returningAll().executeTakeFirstOrThrow())
})
