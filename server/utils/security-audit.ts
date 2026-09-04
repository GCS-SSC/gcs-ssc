import type { Kysely } from 'kysely'
import type { Database, JsonValue, SecurityAuditEventTable } from '~~/shared/types/database'

export interface SecurityAuditEventInput {
  actorUserId: string
  eventType: SecurityAuditEventTable['event_type']
  targetType: SecurityAuditEventTable['target_type']
  targetId: string
  metadata?: JsonValue
}

/**
 * Records a non-sensitive security event in the caller's mutation transaction.
 *
 * @param db - Transaction-bound database connection.
 * @param event - Actor, event category, target, and safe structural metadata.
 */
export const recordSecurityAuditEvent = async (
  db: Kysely<Database>,
  event: SecurityAuditEventInput
): Promise<void> => {
  await db
    .insertInto('security_audit_event')
    .values({
      actor_user_id: event.actorUserId,
      event_type: event.eventType,
      target_type: event.targetType,
      target_id: event.targetId,
      metadata: event.metadata ?? {}
    })
    .execute()
}
