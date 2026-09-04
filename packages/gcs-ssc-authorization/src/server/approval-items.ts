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
    target: ExactEntityTarget<Entity_Type>
  ): Promise<ApprovalItemGrant | null> {
    const row = await this.db
      .selectFrom('user')
      .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
      .innerJoin('Common_Approval', join => join.on(eb => eb.or([
        eb('Common_Approval.egcs_cn_assigneduser', '=', eb.ref('Common_User.id')),
        eb.and([
          eb('Common_Approval.egcs_cn_assigneduser', 'is', null),
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
      .executeTakeFirst()

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
  db: Kysely<Database>
): Promise<ApprovalItemGrant | null> => await new ApprovalItemAuthorizationRepository(db)
  .resolve(applicationUserId, target)
