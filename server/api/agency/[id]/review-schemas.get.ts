import {
  EXECUTION_ENTITY_TYPE_ENUM,
  PaginationSchema
} from '~~/shared/types/schemas'
import { REVIEW_TYPE_ENUM } from '~~/shared/constants/enums'
import { z } from 'zod'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'
import { fetchAgencySchemas } from '~~/server/utils/agency-schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const AgencyReviewSchemaListQuerySchema = PaginationSchema.extend({
  reviewType: z.enum(REVIEW_TYPE_ENUM).optional(),
  entityType: z.enum(EXECUTION_ENTITY_TYPE_ENUM).optional()
})

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id')
  if (!agencyId) {
    return await badRequest(event, 'MISSING_AGENCY_ID', 'apiErrors.request.missing_agency_id')
  }
  if (!isPositivePostgresBigintText(agencyId)) {
    return await notFound(event, 'AGENCY_NOT_FOUND', 'apiErrors.agency.not_found')
  }

  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })

  const query = await getValidatedQueryI18n(event, AgencyReviewSchemaListQuerySchema)
  const { page, limit, search, reviewType, entityType } = query
  const offset = (page - 1) * limit

  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    return await fetchAgencySchemas({
      db: trx,
      reviewType,
      entityType,
      agencyId,
      search,
      page,
      limit,
      offset
    })
  })
})
