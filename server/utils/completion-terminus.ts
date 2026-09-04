import type { Kysely, Transaction } from 'kysely'
import type { Database, Entity_Type } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

/**
 * Resolves whether immutable Completion evidence has reached its positive business terminus.
 * @param db - Database or transaction used to read the pinned completion lineage.
 * @param entityType - Exact completed entity type.
 * @param entityId - Exact completed entity identifier.
 * @returns Whether Completion needs no workflow or its latest linked attempt ended positively.
 */
export const hasPositiveCompletionTerminus = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string
): Promise<boolean> => {
  const completion = await db.selectFrom('Common_Completion')
    .select(['id', 'egcs_cn_disposition'])
    .where('egcs_cn_entitytype', '=', entityType)
    .where('egcs_cn_entityid', '=', entityId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!completion) return false
  if (completion.egcs_cn_disposition === 'no_workflow') return true
  if (completion.egcs_cn_disposition !== 'workflow_started') return false
  const latestRun = await db.selectFrom('Common_Workflow_Run')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Workflow_Run.id')
    .select('Common_Runtime.egcs_cn_state')
    .where('Common_Workflow_Run.egcs_cn_completion', '=', String(completion.id))
    .where('Common_Runtime._deleted', '=', false)
    .orderBy('Common_Runtime.egcs_cn_attempt', 'desc')
    .executeTakeFirst()
  return latestRun?.egcs_cn_state === 'succeeded' || latestRun?.egcs_cn_state === 'approved'
}
