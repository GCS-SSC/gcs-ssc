import { AgencyFundingTypePatchSchema } from '~~/shared/types/schemas/funding-sources'
import { requireFundingAgency, requireFundingType, withFundingAgencyWrite } from '~~/server/utils/funding-source-configuration'

// eslint-disable-next-line local/require-authorize -- delegated to requireFundingAgency
export default defineEventHandler(async event => {
  const agencyId = await requireFundingAgency(event, 'update', getRouterParam(event, 'agencyId'))
  const typeId = getRouterParam(event, 'typeId')
  const body = await readValidatedBodyI18n(event, AgencyFundingTypePatchSchema)
  if (!Object.keys(body).length) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  return await withFundingAgencyWrite(event, agencyId, async db => {
    await requireFundingType(event, db, agencyId, typeId)
    return await db.updateTable('Agency_Funding_Type').set(body).where('id', '=', typeId!).returningAll().executeTakeFirstOrThrow()
  })
})
