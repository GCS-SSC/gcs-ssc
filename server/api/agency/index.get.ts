import { PaginationSchema } from '~~/shared/types/schemas'
import { authorize, resolveAnyAgency } from '~~/server/utils/authorize'
import { listAgenciesForRoute } from '~~/server/utils/agency-list-route'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const authContext = await authorize(
    event,
    'agency',
    'read',
    resolveAnyAgency(event.context.$db)
  )
  const query = await getValidatedQueryI18n(event, PaginationSchema)

  return await listAgenciesForRoute(db, authContext, query)
})
