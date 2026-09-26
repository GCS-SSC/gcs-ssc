/* eslint-disable jsdoc/require-returns, jsdoc/require-param-description -- access helpers mirror the guarded route contract */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AuthContext } from './authorize'
import { authorize, authorizeAssignedItem, authorizeFreshAssignedItem, authorizeWithFreshAuthContext } from './authorize'
import { notFound } from './api-errors'
import { resolveFundingCaseScope, resolveFundingOpportunityScope } from './funding-case'

type ResourceAction = 'read' | 'update' | 'delete'

/**
 *
 * @param event
 * @param id
 * @param action
 * @param db
 * @param fresh
 */
export const requireFundingOpportunityAccess = async (
  event: H3Event, id: string, action: ResourceAction, db: Kysely<Database>, fresh?: AuthContext
) => {
  const scope = await resolveFundingOpportunityScope(db, id)
  if (!scope) return await notFound(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (fresh) await authorizeWithFreshAuthContext(event, fresh, 'transfer_payment', action, scope.scope)
  else await authorize(event, 'transfer_payment', action, scope.scope)
  return scope
}

/**
 *
 * @param event
 * @param id
 * @param action
 * @param db
 * @param fresh
 */
export const requireFundingCaseAccess = async (
  event: H3Event, id: string, action: ResourceAction, db: Kysely<Database>, fresh?: AuthContext
) => {
  const scope = await resolveFundingCaseScope(db, id)
  if (!scope) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  if (fresh) {
    await authorizeWithFreshAuthContext(event, fresh, 'funding_case', action, scope.scope)
    if (action !== 'read') await authorizeFreshAssignedItem(event, db, fresh, 'fundingcaseintake', id, action)
  } else {
    await authorize(event, 'funding_case', action, scope.scope)
    if (action !== 'read') await authorizeAssignedItem(event, 'fundingcaseintake', id)
  }
  return scope
}
