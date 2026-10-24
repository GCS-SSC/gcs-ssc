import { useEvent, useRuntimeConfig } from 'nitropack/runtime'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { auditRequestSnapshot } from './audit-request'
import {
  acquireDatabaseLease,
  destroyDatabase,
  useDatabase,
  type DatabaseLease,
  type DatabaseRuntimeDependencies
} from '../database/runtime'

export { parsePostgresDate, resolveDatabaseConfig } from '../database/runtime'
export type { DatabaseLease } from '../database/runtime'

declare module 'h3' {
  interface H3EventContext {
    $db: Kysely<Database>
    $dbHealthCheck: () => Promise<void>
  }
}

const dependencies: DatabaseRuntimeDependencies = {
  config: () => useRuntimeConfig(),
  context: {
    type: 'http',
    /** @returns The current request's response lifecycle independently of its actor. */
    accessRequest: () => {
      try {
        return useEvent().context.accessLogRequest
      } catch {
        return undefined
      }
    },
    /** @returns Immutable query attribution from the verified request context. */
    identity: () => {
      let event
      try {
        event = useEvent()
      } catch { /* Background callers must supply an explicit audit scope. */ }
      if (!event) throw new Error('Audit execution requires an HTTP event or explicit identity')
      const actorUserId = event.context.$authContext?.userId ?? event.context.auditActorUserId ?? null
      return { execution: { type: 'global' }, http: auditRequestSnapshot(event), actorUserId, actorKind: actorUserId ? 'user' : 'anonymous',
        requestId: event.context.auditRequestId ?? null,
        protected: event.path.startsWith('/api/') && !event.path.startsWith('/api/auth/') }
    }
  }
}

/** @returns The process database with Nitro runtime configuration and HTTP attribution. */
export const useDb = (): Kysely<Database> => useDatabase(dependencies)

/** @returns A generation-bound lease shared by this process's Nitro lifecycle owners. */
export const acquireDbLease = async (): Promise<DatabaseLease> => await acquireDatabaseLease(dependencies)

/** Closes the current process database generation and its independent access store. */
export const destroyDb = destroyDatabase
