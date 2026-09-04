import { toWebRequest } from 'h3'

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
// eslint-disable-next-line local/require-authorize -- Better Auth owns this delegated authentication protocol surface.
export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
