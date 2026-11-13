import { appendResponseHeader, getResponseHeader, removeResponseHeader, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'

const DENY_FRAME_POLICY = 'frame-ancestors \'none\''

/**
 * Restricts demo embedding to an explicitly configured serialized HTTP origin.
 * @returns The exact parent origin, or null for every ordinary/invalid runtime.
 */
const resolveDemoParentOrigin = (): string | null => {
  if (process.env.GCS_RUNTIME_MIGRATION_MODE !== 'webcontainer-demo') return null
  const configured = process.env.GCS_WEBCONTAINER_FRAME_ORIGIN
  if (!configured) return null
  try {
    const url = new URL(configured)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === configured && !url.hostname.includes('*')
      ? url.origin
      : null
  } catch {
    return null
  }
}

/** Applies the runtime framing boundary while preserving independent CSP policies.
 * @param event - The outgoing request event.
 * @param policy - The runtime frame-ancestors directive.
 * @param parentOrigin - Exact allowed demo parent, or null to deny embedding.
 */
const applyFramePolicy = (event: H3Event, policy: string, parentOrigin: string | null): void => {
  if (parentOrigin) removeResponseHeader(event, 'X-Frame-Options')
  else setResponseHeader(event, 'X-Frame-Options', 'DENY')
  const existing = getResponseHeader(event, 'Content-Security-Policy')
  if (!(Array.isArray(existing) ? existing : [existing]).includes(policy)) {
    appendResponseHeader(event, 'Content-Security-Policy', policy)
  }
}

export default defineNitroPlugin(nitroApp => {
  const parentOrigin = resolveDemoParentOrigin()
  const policy = parentOrigin ? `frame-ancestors ${parentOrigin}` : DENY_FRAME_POLICY
  // Direct redirects and error renderers can finish before beforeResponse runs.
  nitroApp.hooks.hook('request', event => applyFramePolicy(event, policy, parentOrigin))
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    applyFramePolicy(event, policy, parentOrigin)
    if (response.body instanceof Response) {
      const headers = new Headers(response.body.headers)
      if (parentOrigin) headers.delete('X-Frame-Options')
      else headers.set('X-Frame-Options', 'DENY')
      headers.append('Content-Security-Policy', policy)
      response.body = new Response(response.body.body, {
        status: response.body.status,
        statusText: response.body.statusText,
        headers
      })
    }
  })
})
