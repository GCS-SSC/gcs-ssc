import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from './api-errors'
import { isAssignableGroup } from './groups'

/**
 * Rejects a group that is deleted, empty, or outside the template agency.
 * @param event - Request used for a localized validation error.
 * @param db - Current read or write transaction.
 * @param agencyId - Agency that owns the template.
 * @param groupIds - Group ids from template steps.
 * @returns Nothing when all groups are eligible.
 */
export const assertApprovalTemplateGroups = async (
  event: H3Event,
  db: Kysely<Database> | Transaction<Database>,
  agencyId: string | null,
  groupIds: Array<string | null | undefined>
) => {
  const unique = [...new Set(groupIds.filter((id): id is string => Boolean(id)))]
  for (const id of unique) {
    if (!agencyId || !await isAssignableGroup(db, id, agencyId)) {
      return await badRequest(event, 'APPROVAL_TEMPLATE_GROUP_INVALID', 'apiErrors.request.invalid')
    }
  }
}
