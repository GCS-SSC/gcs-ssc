import type { SecurityAuditEventTable } from './database'

const securityOperations = {
  'role.created': true,
  'role.profile_updated': true,
  'role.deleted': true,
  'role.permission_updated': true,
  'user.created': true,
  'user.profile_updated': true,
  'user.deleted': true,
  'user.activated': true,
  'user.role_assignment_created': true,
  'user.role_assignment_deleted': true
} satisfies Record<SecurityAuditEventTable['event_type'], true>

export const AUDIT_OPERATION_VALUES = [
  'insert', 'update', 'delete', 'soft_delete', 'restore', 'departure', 'arrival',
  ...Object.keys(securityOperations)
]
export const ACCESS_OUTCOME_VALUES = ['success', 'failed']
