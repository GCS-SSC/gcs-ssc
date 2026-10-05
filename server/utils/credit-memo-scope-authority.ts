/* eslint-disable jsdoc/require-jsdoc -- Multi-Agreement credit memo authority remains explicit through runtime children. */
import type { Kysely } from 'kysely'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { AbilityAction } from '~~/shared/utils/abilities'
import type { AuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'

export const resolveCreditMemoAuthorityTarget = async (db: Kysely<Database>, entityType: AssignableEntityType, entityId: string) => {
  const visited = new Set<string>()
  let current = { entityType, entityId }
  while (current.entityType === 'commonreview' || current.entityType === 'commonrecommendation') {
    const { resolveEntityAssignmentSourceTarget } = await import('./entity-assignment')
    const key = `${current.entityType}:${current.entityId}`
    if (visited.has(key)) return null
    visited.add(key)
    const source = await resolveEntityAssignmentSourceTarget(db, current.entityType, current.entityId)
    if (!source) return null
    current = source
  }
  return current.entityType === 'fundingcaseaccountreceivablecreditmemo' ? current.entityId : null
}

export const canAccessCreditMemoTargetScopes = async (
  db: Kysely<Database>, auth: AuthContext, entityType: AssignableEntityType, entityId: string, action: AbilityAction | 'manage_assignments'
) => {
  const id = await resolveCreditMemoAuthorityTarget(db, entityType, entityId)
  if (!id) return true
  const { resolveAccountReceivableCreditMemoRuntimeContext } = await import('./account-receivable-context')
  const context = await resolveAccountReceivableCreditMemoRuntimeContext(db, id)
  if (!context) return false
  const ownerAllowed = action === 'manage_assignments'
    ? auth.userAbilities.canManageAssignments('account_receivable', context.scope)
    : auth.userAbilities.authorize('account_receivable', action, context.scope)
  if (!ownerAllowed) return false
  for (const agreementId of context.agreementIds) {
    const owner = await resolveAgreementScopeContext(agreementId, db)
    if (!owner || owner.agencyId !== context.agencyId) return false
    const allowed = action === 'manage_assignments'
      ? auth.userAbilities.canManageAssignments('account_receivable', owner.scope)
      : auth.userAbilities.authorize('account_receivable', action, owner.scope)
    if (!allowed) return false
  }
  return true
}
