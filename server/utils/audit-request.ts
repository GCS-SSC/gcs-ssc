/* eslint-disable jsdoc/require-jsdoc -- Request capture never reads the stream or changes validation. */
import { getQuery, getRouterParams, type H3Event } from 'h3'
import { getGcsExtensionByKey } from '#gcs-extensions/server-registry'
import type { GcsRegisteredExtension } from '../../shared/utils/extensions'
import { sanitizeAuditInput } from './audit-inputs'

/** Restriction is sticky for the complete request, including later host queries.
 * @param event - Host request whose input snapshots need classification.
 * @param extension - Registered extension metadata.
 * @param extension.requiredHostCapabilities - Declared host capabilities, including secret storage.
 */
export const classifyExtensionAuditInputs = (event: H3Event, extension: Pick<GcsRegisteredExtension, 'requiredHostCapabilities'>): void => {
  if (extension.requiredHostCapabilities?.includes('extension-secrets')) {
    event.context.auditRequestInputsRestricted = true
    if (Object.hasOwn(event.context, 'auditRequestBody')) event.context.auditRequestBody = { state: 'restricted' }
  }
}

const requestInputsRestricted = (event: H3Event): boolean => {
  // Authentication middleware queries run before extension dispatch. Resolve
  // static capability metadata here without loading handlers or querying the DB.
  const extensionKey = /^\/api\/extensions\/([^/?]+)/.exec(event.path)?.[1]
  if (extensionKey) {
    let decodedKey: string
    try {
      decodedKey = decodeURIComponent(extensionKey)
    } catch {
      event.context.auditRequestInputsRestricted = true
      return true
    }
    const extension = getGcsExtensionByKey(decodedKey)
    if (extension) classifyExtensionAuditInputs(event, extension)
  }
  if (/\/auth(?:\/|$)|secret|credential/i.test(event.path)) event.context.auditRequestInputsRestricted = true
  return event.context.auditRequestInputsRestricted === true
}

export const captureAuditRequestBody = (event: H3Event, body: unknown): void => {
  event.context.auditRequestBody = requestInputsRestricted(event) ? { state: 'restricted' } : sanitizeAuditInput(body)
}

/** Uses H3's already-consumed raw-body cache; never opens or rereads a stream.
 * @param event - Request whose host or SDK reader has completed.
 * @param body - Parsed body used by existing validation.
 */
export const captureParsedAuditRequestBody = async (event: H3Event, body: unknown): Promise<void> => {
  const request = event.node?.req
  const cached: unknown = request ? Reflect.get(request, Symbol.for('h3RawBody')) : undefined
  const raw = cached === undefined ? undefined : await cached
  const isJson = String(request?.headers?.['content-type'] ?? '').includes('json')
  captureAuditRequestBody(event, isJson && (typeof raw === 'string' || Buffer.isBuffer(raw)) ? raw.toString() : body)
}

export const auditRequestSnapshot = (event: H3Event) => {
  // Authentication and secret administration must not rely on payload field names.
  if (requestInputsRestricted(event)) {
    return { method: event.method, state: 'restricted' }
  }
  return {
    method: event.method,
    params: sanitizeAuditInput(getRouterParams(event)),
    query: sanitizeAuditInput(getQuery(event)),
    body: Object.hasOwn(event.context, 'auditRequestBody') ? event.context.auditRequestBody : { state: 'unavailable' }
  }
}
