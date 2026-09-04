import { AgencyAttachmentTypeSchema } from '~~/shared/types/schemas'
import { authorize } from '~~/server/utils/authorize'
import { assertActiveAgencyProfile, withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  await assertActiveAgencyProfile(event, agencyId)
  const body = await readValidatedBodyI18n(event, AgencyAttachmentTypeSchema)

  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => await trx
      .insertInto('Common_Attachment_Types')
      .values({ ...body, egcs_cn_agency: agencyId })
      .returningAll()
      .executeTakeFirstOrThrow())
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
