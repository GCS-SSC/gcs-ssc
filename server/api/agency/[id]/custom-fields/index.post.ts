import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { AgencyCustomFieldCreateSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyCustomFieldCreateSchema)
  return await withActiveAgencyMutationTransaction(event, agencyId, async trx => await trx
    .insertInto('Agency_Custom_Field')
    .values({ ...body, egcs_ay_agency: agencyId })
    .returningAll()
    .executeTakeFirstOrThrow())
})
