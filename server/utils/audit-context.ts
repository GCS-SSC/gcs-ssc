import nodeProcess from 'node:process'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { AuditIdentity } from './audit-driver'

type AuditScope = { identity?: AuditIdentity; bypass?: boolean }
const state = nodeProcess as NodeJS.Process & { __gcsAuditScope?: AsyncLocalStorage<AuditScope> }
export const auditScope = state.__gcsAuditScope ??= new AsyncLocalStorage<AuditScope>()
export const withoutAuditCapture = <T>(work: () => Promise<T>): Promise<T> => auditScope.run({ bypass: true }, work)
export const withAnonymousAudit = <T>(requestId: string | null, work: () => Promise<T>): Promise<T> =>
  auditScope.run({ identity: { actorKind: 'anonymous', actorUserId: null, requestId, protected: false } }, work)
