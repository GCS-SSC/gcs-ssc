/* eslint-disable jsdoc/require-jsdoc -- Repository contracts use the package's exact-grant vocabulary. */
import type { Kysely } from 'kysely'
import type { Database, Entity_Type } from '../../../../shared/types/database'
import type { ExactEntityGrant, ExactEntityTarget } from '../grants'

export type ApprovalItemGrant = ExactEntityGrant<Entity_Type> & {
  commonUserId: string
  approvalId: string
}

/** Resolves a read-only exact grant contributed by an active runtime approval assignment. */
export class ApprovalItemAuthorizationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async resolve(
    applicationUserId: string,
    target: ExactEntityTarget<Entity_Type>,
    workflow?: { runtimeId?: string }
  ): Promise<ApprovalItemGrant | null> {
    let query = this.db
      .selectFrom('user')
      .innerJoin('Common_User', 'Common_User.egcs_cn_authuserid', 'user.id')
      .innerJoin('Common_Approval', join => join.on(eb => eb.or([
        eb('Common_Approval.egcs_cn_assigneduser', '=', eb.ref('Common_User.id')),
        eb.and([
          eb('Common_Approval.egcs_cn_assigneduser', 'is', null),
          eb('Common_Approval.egcs_cn_assignedgroup', 'is', null),
          eb('Common_Approval.egcs_cn_defaultuser', '=', eb.ref('Common_User.id'))
        ])
      ])))
      .innerJoin('Common_Routing_Slip', 'Common_Routing_Slip.id', 'Common_Approval.egcs_cn_routingslip')
      .select([
        'Common_User.id as common_user_id',
        'Common_Approval.id as approval_id'
      ])
      .where('user.id', '=', applicationUserId)
      .where('user._deleted', '=', false)
      .where('Common_User._deleted', '=', false)
      .where('Common_Routing_Slip._deleted', '=', false)
      .where('Common_Routing_Slip.egcs_cn_entitytype', '=', target.entityType)
      .where('Common_Routing_Slip.egcs_cn_entityid', '=', target.entityId)

    if (workflow) {
      query = query.where(eb => {
        let runtime = eb.selectFrom('Common_Runtime_Item')
          .innerJoin('Common_Runtime', 'Common_Runtime.id', 'Common_Runtime_Item.egcs_cn_runtime')
          .select('Common_Runtime.id')
          .whereRef('Common_Runtime_Item.id', '=', 'Common_Routing_Slip.egcs_cn_runtimeitem')
          .where('Common_Runtime_Item.egcs_cn_parentruntimeitem', 'is', null)
          .where('Common_Runtime_Item._deleted', '=', false)
          .where('Common_Runtime._deleted', '=', false)
          .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
          .where('Common_Runtime.egcs_cn_purpose', '=', 'approval_submission')
          .whereRef('Common_Runtime.egcs_cn_entitytype', '=', 'Common_Routing_Slip.egcs_cn_entitytype')
          .whereRef('Common_Runtime.egcs_cn_entityid', '=', 'Common_Routing_Slip.egcs_cn_entityid')
        if (workflow.runtimeId) runtime = runtime.where('Common_Runtime.id', '=', workflow.runtimeId)
        return eb.exists(runtime)
      })
        .orderBy('Common_Approval.id', 'desc')
    }
    const row = await query.executeTakeFirst()

    if (!row) return null
    return {
      source: 'approval',
      entityType: target.entityType,
      entityId: target.entityId,
      actions: new Set(['read']),
      commonUserId: String(row.common_user_id),
      approvalId: String(row.approval_id)
    }
  }
}

export const resolveApprovalItemGrant = async (
  applicationUserId: string,
  target: ExactEntityTarget<Entity_Type>,
  db: Kysely<Database>,
  workflow?: { runtimeId?: string }
): Promise<ApprovalItemGrant | null> => await new ApprovalItemAuthorizationRepository(db)
  .resolve(applicationUserId, target, workflow)
