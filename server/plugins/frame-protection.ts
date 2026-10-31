import { appendResponseHeader, getResponseHeader, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'

const FRAME_POLICY = 'frame-ancestors \'none\''

/** Prevent embedding while preserving independently configured CSP policies.
 * @param event - The outgoing request event.
 */
const preventFraming = (event: H3Event): void => {
  setResponseHeader(event, 'X-Frame-Options', 'DENY')
  const existing = getResponseHeader(event, 'Content-Security-Policy')
  if (!(Array.isArray(existing) ? existing : [existing]).includes(FRAME_POLICY)) {
    appendResponseHeader(event, 'Content-Security-Policy', FRAME_POLICY)
  }
}

export default defineNitroPlugin(nitroApp => {
  // Direct redirects and error renderers can finish before beforeResponse runs.
  nitroApp.hooks.hook('request', preventFraming)
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    preventFraming(event)
    if (response.body instanceof Response) {
      const headers = new Headers(response.body.headers)
      headers.set('X-Frame-Options', 'DENY')
      headers.append('Content-Security-Policy', FRAME_POLICY)
      response.body = new Response(response.body.body, {
        status: response.body.status,
        statusText: response.body.statusText,
        headers
      })
    }
  })
})
