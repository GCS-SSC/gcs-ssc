import { defineEventHandler, getRouterParam } from 'h3'
import { authorizeActiveAgencySubentity, softDeleteActiveAgencySubentity } from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

const missing = {
  code: 'PROPONENT_RELATIONSHIP_TYPE_NOT_FOUND',
  key: 'apiErrors.agency.proponent_relationship_type_not_found'
}

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')

  const table = 'Agency_Proponent_Relationship_Type'
  const { agencyId } = await authorizeActiveAgencySubentity(event, table, id, 'delete', missing)

  try {
    const deleted = await event.context.$db.transaction().execute(async trx =>
      await softDeleteActiveAgencySubentity(event, trx, table, id, agencyId)
    )
    if (!deleted) return await notFound(event, missing.code, missing.key)
    return { success: true }
  } catch (error: unknown) {
    return await throwIfAgencyUniqueConstraintError(event, error)
  }
})
