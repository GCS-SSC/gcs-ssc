import {
  authorizeActiveAgencySubentity,
  softDeleteActiveAgencySubentity
} from '~~/server/utils/agency-auth'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Applicant_Recipient_Subtype',
    id,
    'delete',
    {
      code: 'APPLICANT_RECIPIENT_SUBTYPE_NOT_FOUND',
      key: 'apiErrors.agency.applicant_recipient_subtype_not_found'
    }
  )
  const deleted = await db.transaction().execute(async trx =>
    await softDeleteActiveAgencySubentity(
      event,
      trx,
      'Agency_Applicant_Recipient_Subtype',
      id,
      agencyId
    )
  )
  if (!deleted) {
    return await notFound(
      event,
      'APPLICANT_RECIPIENT_SUBTYPE_NOT_FOUND',
      'apiErrors.agency.applicant_recipient_subtype_not_found'
    )
  }
  return { success: true }
})
