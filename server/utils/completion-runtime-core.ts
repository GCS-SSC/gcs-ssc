import type { Kysely, Transaction } from 'kysely'
import type { CompletionHookPayload } from '~~/shared/types/completion'
import type { CompletionDisposition } from '~~/shared/constants/system-lifecycle'
import type { Database, Entity_Type } from '~~/shared/types/database'

declare const useNitroApp: () => {
  hooks: { callHook: (name: 'common:completion:completed', payload: CompletionHookPayload) => Promise<void> }
}

export type CompletionRecord = {
  id: string
  egcs_cn_comments: string
  egcs_cn_user: string
  egcs_cn_user_name: string
  egcs_cn_completedat: string
  egcs_cn_disposition: CompletionDisposition
}

/**
 * Resolves immutable completion evidence without depending on the current user projection.
 *
 * This is intentionally narrower than {@link resolveCompletionRecord}: workflow lineage must
 * retain the completion link even if the completing user's display record is later unavailable.
 *
 * @param db - Database connection.
 * @param entityType - Runtime entity type stored on `Common_Completion`.
 * @param entityId - Runtime entity id stored on `Common_Completion`.
 * @returns The completion identifier or null when no active evidence exists.
 */
export const resolveCompletionEvidenceId = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<string | null> => {
  const completion = await db
    .selectFrom('Common_Completion')
    .select('id')
    .where('egcs_cn_entitytype', '=', entityType)
    .where('egcs_cn_entityid', '=', entityId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return completion ? String(completion.id) : null
}

/**
 * Loads the completion audit row for a runtime entity independently of the actor's current
 * lifecycle state. The immutable actor id remains authoritative; the display name is only a
 * best-effort projection.
 *
 * @param db - Database connection.
 * @param entityType - Runtime entity type stored on `Common_Completion`.
 * @param entityId - Runtime entity id stored on `Common_Completion`.
 * @returns The completion audit record or null when the entity is not yet complete.
 */
export const resolveCompletionRecord = async (
  db: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<CompletionRecord | null> => {
  const row = await db
    .selectFrom('Common_Completion')
    .leftJoin('Common_User', 'Common_User.id', 'Common_Completion.egcs_cn_user')
    .select([
      'Common_Completion.id as id',
      'Common_Completion.egcs_cn_comments as comments',
      'Common_Completion.egcs_cn_user as user_id',
      'Common_Completion.egcs_cn_completedat as completed_at',
      'Common_Completion.egcs_cn_disposition as disposition',
      'Common_User.egcs_cn_name as user_name'
    ])
    .where('Common_Completion.egcs_cn_entitytype', '=', entityType)
    .where('Common_Completion.egcs_cn_entityid', '=', entityId)
    .where('Common_Completion._deleted', '=', false)
    .executeTakeFirst()

  if (!row || !row.completed_at) {
    return null
  }

  return {
    id: String(row.id),
    egcs_cn_comments: row.comments ?? '',
    egcs_cn_user: String(row.user_id),
    egcs_cn_user_name: row.user_name ?? '',
    egcs_cn_completedat: new Date(row.completed_at).toISOString(),
    egcs_cn_disposition: row.disposition
  }
}

/**
 * Inserts the authoritative completion audit row for a runtime entity.
 *
 * @param trx - Open transaction used for completion persistence.
 * @param values - Runtime completion values.
 * @param values.entityType - Runtime entity type stored on the completion row.
 * @param values.entityId - Runtime entity identifier stored on the completion row.
 * @param values.comments - Persisted completion comment.
 * @param values.userId - Current common user performing the completion.
 * @param values.disposition - Immutable point-in-time Workflow selection result.
 * @returns The created completion id and authoritative completed timestamp.
 */
export const createCompletionRecord = async (
  trx: Transaction<Database>,
  values: {
    entityType: Entity_Type
    entityId: string
    comments: string
    userId: string
    disposition: CompletionDisposition
  }
): Promise<{ id: string, completedAt: string }> => {
  const createdCompletion = await trx
    .insertInto('Common_Completion')
    .values({
      egcs_cn_entitytype: values.entityType,
      egcs_cn_entityid: values.entityId,
      egcs_cn_comments: values.comments,
      egcs_cn_user: values.userId,
      egcs_cn_disposition: values.disposition,
      // The DB trigger owns the final authoritative completion timestamp.
      egcs_cn_completedat: new Date(),
      _deleted: false
    })
    .returning([
      'id',
      'egcs_cn_completedat'
    ])
    .executeTakeFirstOrThrow()

  return {
    id: String(createdCompletion.id),
    completedAt: new Date(createdCompletion.egcs_cn_completedat).toISOString()
  }
}

/**
 * Emits the post-commit completion hook for plugin observers.
 *
 * @param payload - Post-commit completion payload for Nitro hook consumers.
 */
export const emitCompletionHook = async (payload: CompletionHookPayload): Promise<void> => {
  try {
    await useNitroApp().hooks.callHook('common:completion:completed', payload)
  } catch (error) {
    console.error('Completion Nitro hook failed', {
      hook: 'common:completion:completed',
      entityType: payload.entityType,
      entityId: payload.entityId,
      completionId: payload.completionId,
      error
    })
  }
}
