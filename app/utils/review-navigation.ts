import { appRouteLocations } from '~/utils/route-locations'
import type { RouteLocationResolvedGeneric } from 'vue-router'

type ReturnRouteResolver = { resolve: (path: string) => RouteLocationResolvedGeneric }

/* eslint-disable jsdoc/require-jsdoc */
export const getReviewReturnPath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value
}

export const resolveReviewReturnLocation = (value: unknown, router: ReturnRouteResolver) => {
  const path = getReviewReturnPath(value)
  if (!path) return null
  const resolved = router.resolve(path)
  if (typeof resolved.name !== 'string') return { path: resolved.path, query: resolved.query, hash: resolved.hash }
  return { path: resolved.path, name: resolved.name, params: resolved.params, query: resolved.query, hash: resolved.hash }
}

/** Keeps an Agreement review's ordinary return link on its loaded owner.
 * @param value Requested native return location.
 * @param router Host route resolver.
 * @param owner Authorized loaded review owner.
 * @returns The same-owner return location, or the owner's risk workspace.
 */
export const resolveOwnedReviewReturnLocation = (
  value: unknown,
  router: ReturnRouteResolver,
  owner: { type: string; id: string } | null
) => {
  const requested = resolveReviewReturnLocation(value, router)
  if (owner?.type !== 'fundingcaseagreement') return requested
  const path = getReviewReturnPath(value)
  if (requested && path) {
    const resolved = router.resolve(path)
    if (typeof resolved.name === 'string' && resolved.name.split('___')[0] === 'agreements-id' && 'id' in resolved.params && resolved.params.id === owner.id) return requested
  }
  return appRouteLocations.agreementDetail(owner.id, { section: 'risk-rating' })
}
