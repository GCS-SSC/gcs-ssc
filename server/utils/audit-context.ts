/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal execution context helpers have explicit typed contracts. */
import nodeProcess from 'node:process'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { AuditIdentity } from './audit-driver'

export type AuditExecutionScope = { type: 'global' } | { type: 'agency'; agencyId: string } | { type: 'transfer'; table: string; recordId: string; sourceAgencyId: string; destinationAgencyId: string }
export type AuditCreationOwner = {
  table: string
  match: Readonly<Record<string, string>>
  ownerTable: string
  ownerRow: Readonly<Record<string, string>>
}
type AuditScope = { identity?: AuditIdentity; bypass?: boolean; execution?: AuditExecutionScope; creationOwner?: AuditCreationOwner }
const state = nodeProcess as NodeJS.Process & { __gcsAuditScope?: AsyncLocalStorage<AuditScope> }
export const auditScope = state.__gcsAuditScope ??= new AsyncLocalStorage<AuditScope>()
export const withoutAuditCapture = <T>(work: () => Promise<T>): Promise<T> => auditScope.run({ bypass: true }, work)
export const withAnonymousAudit = <T>(requestId: string | null, work: () => Promise<T>): Promise<T> =>
  auditScope.run({ identity: { actorKind: 'anonymous', actorUserId: null, requestId, protected: false } }, work)

/**
 * Runs verified owner work without changing transaction, actor, or request lifetime.
 */
export const withAuditExecution = <T>(execution: AuditExecutionScope, work: () => Promise<T>): Promise<T> =>
  auditScope.run({ ...auditScope.getStore(), execution: Object.freeze({ ...execution }) }, work)

/** Supplies the verified caller's owner only for the matching newly inserted record. */
export const withAuditCreationOwner = <T>(
  table: string,
  match: Readonly<Record<string, string>>,
  owner: { entityType: string; entityId: string },
  work: () => Promise<T>
): Promise<T> => auditScope.run({
  ...auditScope.getStore(),
  creationOwner: Object.freeze({
    table,
    match: Object.freeze({ ...match }),
    ownerTable: 'public.Common_Runtime',
    ownerRow: Object.freeze({ egcs_cn_entitytype: owner.entityType, egcs_cn_entityid: owner.entityId })
  })
}, work)
