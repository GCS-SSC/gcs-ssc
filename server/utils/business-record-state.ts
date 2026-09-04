import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import type { CompletionDisposition, RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database, Workflow_Target_Entity_Type } from '~~/shared/types/database'
import type { BusinessRecordStateFields } from '~~/shared/types/business-record-state'

type DbClient = Kysely<Database> | Transaction<Database>

interface RecordStateQueryRow {
  entityId: string
  isCompleted: boolean
  completionDisposition: CompletionDisposition | null
  workflowRuntimeId: string | null
  workflowRuntimeState: RuntimeState | null
  approvalRuntimeId: string | null
  approvalRuntimeState: RuntimeState | null
  routingSlipId: string | null
}

const EMPTY_RECORD_STATE: BusinessRecordStateFields = {
  isCompleted: false,
  completionDisposition: null,
  workflowRuntimeId: null,
  workflowRuntimeState: null,
  lifecycleTerminus: 'not_completed',
  approvalRuntimeId: null,
  approvalRuntimeState: null,
  routingSlipId: null
}

/**
 * Normalizes adapter-native bigint business status values at the API projection boundary.
 *
 * @param row - Business record returned by the active database adapter.
 * @returns The record with a string status ID when it carries a business status.
 */
const normalizeBusinessStatusId = <Row>(row: Row): Row => {
  if (
    row !== null
    && typeof row === 'object'
    && 'egcs_fc_status' in row
    && row.egcs_fc_status !== null
    && row.egcs_fc_status !== undefined
  ) {
    return { ...row, egcs_fc_status: String(row.egcs_fc_status) }
  }

  return row
}

/**
 * Loads immutable evidence for exact typed business targets in one query.
 *
 * Exact entity-type matching is intentional: a review or recommendation may use
 * the same numeric ID as its business target, but its routing slip is not target-level evidence.
 *
 * @param db - Query client for the active request or transaction.
 * @param entityType - Exact business target type shared by all requested IDs.
 * @param entityIds - Business target IDs to project.
 * @returns Evidence keyed by target ID.
 */
export const getBusinessRecordStateProjections = async (
  db: DbClient,
  entityType: Workflow_Target_Entity_Type,
  entityIds: Array<string | number>
): Promise<Map<string, BusinessRecordStateFields>> => {
  const uniqueIds = [...new Set(entityIds.map(String))]
  if (uniqueIds.length === 0) return new Map()

  const targetValues = sql.join(uniqueIds.map(entityId => sql`(${entityId}::bigint)`))
  const result = await sql<RecordStateQueryRow>`
    SELECT
      target.entity_id::text AS "entityId",
      completion.id IS NOT NULL AS "isCompleted",
      completion.egcs_cn_disposition AS "completionDisposition",
      completion_workflow.runtime_id::text AS "workflowRuntimeId",
      completion_workflow.runtime_state AS "workflowRuntimeState",
      latest_routing_slip.runtime_id::text AS "approvalRuntimeId",
      latest_routing_slip.runtime_state AS "approvalRuntimeState",
      latest_routing_slip.id::text AS "routingSlipId"
    FROM (VALUES ${targetValues}) AS target(entity_id)
    LEFT JOIN LATERAL (
      SELECT id, egcs_cn_disposition
      FROM "Common_Completion"
      WHERE egcs_cn_entitytype = ${entityType}
        AND egcs_cn_entityid = target.entity_id
        AND _deleted = FALSE
      LIMIT 1
    ) AS completion ON TRUE
    LEFT JOIN LATERAL (
      SELECT runtime.id AS runtime_id, runtime.egcs_cn_state AS runtime_state
      FROM "Common_Workflow_Run" AS workflow_run
      INNER JOIN "Common_Runtime" AS runtime ON runtime.id = workflow_run.id
      WHERE workflow_run.egcs_cn_completion = completion.id
        AND runtime._deleted = FALSE
      ORDER BY runtime.egcs_cn_attempt DESC, runtime.id DESC
      LIMIT 1
    ) AS completion_workflow ON TRUE
    LEFT JOIN LATERAL (
      SELECT routing_slip.id, runtime.id AS runtime_id, runtime_item.egcs_cn_state AS runtime_state
      FROM "Common_Routing_Slip" AS routing_slip
      INNER JOIN "Common_Runtime_Item" AS runtime_item
        ON runtime_item.id = routing_slip.egcs_cn_runtimeitem
      INNER JOIN "Common_Runtime" AS runtime
        ON runtime.id = runtime_item.egcs_cn_runtime
      WHERE routing_slip.egcs_cn_entitytype = ${entityType}
        AND routing_slip.egcs_cn_entityid = target.entity_id
        AND routing_slip._deleted = FALSE
        AND runtime_item.egcs_cn_parentruntimeitem IS NULL
        AND runtime_item._deleted = FALSE
        AND runtime._deleted = FALSE
      ORDER BY runtime.id DESC, routing_slip.id DESC
      LIMIT 1
    ) AS latest_routing_slip ON TRUE
  `.execute(db)

  return new Map(result.rows.map(row => {
    const lifecycleTerminus = !row.isCompleted
      ? 'not_completed' as const
      : row.completionDisposition === 'no_workflow' || row.workflowRuntimeState === 'succeeded' || row.workflowRuntimeState === 'approved'
        ? 'positive' as const
        : row.workflowRuntimeState && ['unsuccessful', 'denied', 'cancelled', 'failed'].includes(row.workflowRuntimeState)
          ? 'negative' as const
          : 'orchestration_in_progress' as const
    return [String(row.entityId), {
      isCompleted: row.isCompleted,
      completionDisposition: row.completionDisposition,
      workflowRuntimeId: row.workflowRuntimeId === null ? null : String(row.workflowRuntimeId),
      workflowRuntimeState: row.workflowRuntimeState,
      lifecycleTerminus,
      approvalRuntimeId: row.approvalRuntimeId === null ? null : String(row.approvalRuntimeId),
      approvalRuntimeState: row.approvalRuntimeState,
      routingSlipId: row.routingSlipId === null ? null : String(row.routingSlipId)
    }]
  }))
}

/**
 * Adds record-state evidence to list or detail query rows without N+1 queries.
 *
 * @param db - Query client for the active request or transaction.
 * @param entityType - Exact business target type shared by all rows.
 * @param rows - Query rows containing a business target ID.
 * @returns The rows with completion and approval evidence attached.
 */
export const withBusinessRecordState = async <Row extends { id: string | number }>(
  db: DbClient,
  entityType: Workflow_Target_Entity_Type,
  rows: Row[]
): Promise<Array<Row & BusinessRecordStateFields>> => {
  const projections = await getBusinessRecordStateProjections(db, entityType, rows.map(row => row.id))
  return rows.map(row => ({
    ...normalizeBusinessStatusId(row),
    ...(projections.get(String(row.id)) ?? EMPTY_RECORD_STATE)
  }))
}
