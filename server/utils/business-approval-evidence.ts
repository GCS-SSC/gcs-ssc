/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- exact approval-evidence query primitives */
import type { Kysely, Transaction } from 'kysely'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { Database, Entity_Type } from '~~/shared/types/database'

type DbClient = Kysely<Database> | Transaction<Database>

export type TargetApprovalEvidence = {
  approvalRuntimeId: string
  approvalRuntimeState: RuntimeState
  routingSlipId: string
}

/** Resolves only routing slips attached to the exact business target, excluding nested review approvals. */
export const resolveLatestTargetApprovalEvidence = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string
): Promise<TargetApprovalEvidence | null> => {
  const routingSlip = await db.selectFrom('Common_Routing_Slip')
    .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
    .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
    .select([
      'Common_Routing_Slip.id as routingSlipId',
      'Common_Runtime.id as approvalRuntimeId',
      'Common_Runtime_Item.egcs_cn_state as approvalRuntimeState'
    ])
    .where('Common_Routing_Slip.egcs_cn_entitytype', '=', entityType)
    .where('Common_Routing_Slip.egcs_cn_entityid', '=', entityId)
    .where('Common_Routing_Slip._deleted', '=', false)
    .where('Common_Runtime_Item.egcs_cn_parentruntimeitem', 'is', null)
    .where('Common_Runtime_Item._deleted', '=', false)
    .where('Common_Runtime._deleted', '=', false)
    .orderBy('Common_Runtime.id', 'desc')
    .orderBy('Common_Routing_Slip.id', 'desc')
    .executeTakeFirst()
  return routingSlip
    ? {
        approvalRuntimeId: String(routingSlip.approvalRuntimeId),
        approvalRuntimeState: routingSlip.approvalRuntimeState,
        routingSlipId: String(routingSlip.routingSlipId)
      }
    : null
}

export const hasApprovedTargetEvidence = async (
  db: DbClient,
  entityType: Entity_Type,
  entityId: string
): Promise<boolean> => (await resolveLatestTargetApprovalEvidence(db, entityType, entityId))?.approvalRuntimeState === 'approved'
