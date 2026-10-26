/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Shared cache subscriptions expose their complete typed contract. */
import type { CatalogCacheChange, CatalogCacheClient } from './catalog-cache-client'

let client: CatalogCacheClient | null = null
const listeners = new Set<(change: CatalogCacheChange) => void>()
let unsubscribe: (() => void) | undefined

/** Installs the browser-owned catalog client for shared request and lookup handling. */
export const setCatalogCacheClient = (next: CatalogCacheClient | null): void => {
  unsubscribe?.()
  client = next
  unsubscribe = next?.subscribe(change => {
    for (const listener of [...listeners]) listener(change)
  })
}

/** Returns the current browser cache without requiring a Nuxt injection in shared helpers. */
export const getCatalogCacheClient = (): CatalogCacheClient | null => client

/** Observes accepted version changes; forms retain ownership of their entered values. */
export const subscribeCatalogCache = (listener: (change: CatalogCacheChange) => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
