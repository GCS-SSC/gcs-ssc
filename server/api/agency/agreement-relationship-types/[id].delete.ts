import { defineEventHandler, getRouterParam } from 'h3'
import {
  authorizeActiveAgencySubentity,
  softDeleteActiveAgencySubentity
} from '~~/server/utils/agency-auth'
import { assertAgencyAgreementRelationshipTypeNotInUse } from '~~/server/utils/agency-agreement-relationship-type-integrity'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Agreement_Relationship_Type',
    id,
    'delete',
    { code: 'AGREEMENT_RELATIONSHIP_TYPE_NOT_FOUND', key: 'apiErrors.agency.agreement_relationship_type_not_found' }
  )
  const deleted = await db.transaction().execute(async trx =>
    await softDeleteActiveAgencySubentity(
      event,
      trx,
      'Agency_Agreement_Relationship_Type',
      id,
      agencyId,
      async lockedTrx => await assertAgencyAgreementRelationshipTypeNotInUse(event, lockedTrx, id)
    )
  )
  if (!deleted) {
    return await notFound(event, 'AGREEMENT_RELATIONSHIP_TYPE_NOT_FOUND', 'apiErrors.agency.agreement_relationship_type_not_found')
  }
  return { success: true }
})
