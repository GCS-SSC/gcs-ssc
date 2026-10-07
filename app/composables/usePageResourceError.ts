import { toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

type PageResourceErrorOptions = {
  errors: MaybeRefOrGetter<unknown>[]
  pending?: MaybeRefOrGetter<boolean>
  hasContent?: MaybeRefOrGetter<boolean>
  identity?: MaybeRefOrGetter<unknown>
}

/**
 * Opens the global error page when a canonical resource cannot initially load.
 * Collection, lookup, mutation and recoverable background errors stay local.
 * Supplied identity scopes accepted content across refreshes that clear request data.
 * Canonical requests must settle together before access or missing-resource promotion.
 *
 * @param options - Canonical request errors, unsettled state and accepted content.
 */
export const usePageResourceError = (options: PageResourceErrorOptions): void => {
  let acceptedContent = false
  let acceptedIdentity = toValue(options.identity)
  watch(() => ({
    identity: toValue(options.identity),
    failures: options.errors.map(error => toValue(error)),
    pending: toValue(options.pending),
    hasContent: toValue(options.hasContent)
  }), ({ failures, pending, hasContent, identity }) => {
    if (identity !== acceptedIdentity) {
      acceptedIdentity = identity
      acceptedContent = false
    }
    if (options.identity !== undefined && hasContent) acceptedContent = true
    if (pending) return
    const statuses = failures.map((failure) => {
      if (!failure || typeof failure !== 'object') return undefined
      const error = failure as { statusCode?: number, status?: number, response?: { status?: number } }
      return error.statusCode ?? error.status ?? error.response?.status
    })
    const resourceStatus = [401, 404, 403].find(status => statuses.includes(status))
    const serverStatus = statuses.some(status => status === 502 || status === 503 || status === 504)
      ? 503
      : statuses.includes(500) ? 500 : undefined
    const statusCode = resourceStatus ?? (hasContent || acceptedContent ? undefined : serverStatus)
    if (statusCode !== undefined) showError({ statusCode, fatal: true })
  }, { immediate: true })
}
