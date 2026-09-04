/* eslint-disable jsdoc/require-jsdoc -- Repository/service contracts use explicit authorization types. */
import type { Kysely } from 'kysely'
import type {
  Database,
  Entity_Type
} from '../../../../shared/types/database'
import { AUTHORIZATION_ACTIONS, type AuthorizationAction } from '../actions'
import {
  exactEntityGrantAllows,
  type ExactEntityGrant,
  type ExactEntityTarget
} from '../grants'

export type AssignedItemGrant = ExactEntityGrant<Entity_Type> & {
  commonUserId: string
  assignmentId: string
  isPrimary: boolean
}

export type ExactGrantResolutionOptions = { lock?: boolean }

/** Resolves active assignment grants for one exact supported item. */
export class AssignedItemAuthorizationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  assertFreshContext(): void {
    if (!this.db.isTransaction) {
      throw new Error('Fresh assignment authorization requires an active transaction')
    }
  }

  async resolve(
    applicationUserId: string,
    entityType: Entity_Type,
    entityId: string,
    options: ExactGrantResolutionOptions = {}
  ): Promise<AssignedItemGrant | null> {
    if (options.lock) this.assertFreshContext()

    let query = this.db.selectFrom('user')
      .innerJoin('Common_User', 'Common_User.egcs_cn_auth_user_id', 'user.id')
      .innerJoin('Common_Entity_Assignment', 'Common_Entity_Assignment.egcs_cn_user', 'Common_User.id')
      .innerJoin('Common_Entity', join => join
        .onRef('Common_Entity.id', '=', 'Common_Entity_Assignment.egcs_cn_entityid')
        .onRef('Common_Entity.egcs_cn_entitytype', '=', 'Common_Entity_Assignment.egcs_cn_entitytype'))
      .select([
        'Common_User.id as common_user_id',
        'Common_Entity_Assignment.id as assignment_id',
        'Common_Entity_Assignment.egcs_cn_isprimary as is_primary'
      ])
      .where('user.id', '=', applicationUserId)
      .where('user._deleted', '=', false)
      .where('Common_User._deleted', '=', false)
      .where('Common_Entity._deleted', '=', false)
      .where('Common_Entity_Assignment.egcs_cn_entitytype', '=', entityType)
      .where('Common_Entity_Assignment.egcs_cn_entityid', '=', entityId)
      .where('Common_Entity_Assignment._deleted', '=', false)

    if (options.lock) query = query.forUpdate('Common_Entity_Assignment')
    const row = await query.executeTakeFirst()
    if (!row) return null

    return {
      source: 'assignment',
      entityType,
      entityId,
      actions: new Set(AUTHORIZATION_ACTIONS),
      commonUserId: String(row.common_user_id),
      assignmentId: String(row.assignment_id),
      isPrimary: row.is_primary
    }
  }

  async resolveTarget(
    applicationUserId: string,
    target: ExactEntityTarget<Entity_Type>,
    options: ExactGrantResolutionOptions = {}
  ): Promise<AssignedItemGrant | null> {
    return await this.resolve(applicationUserId, target.entityType, target.entityId, options)
  }
}

export interface ExactGrantRepository<Context, EntityType extends string> {
  assertFreshContext(context: Context): void
  resolve(
    context: Context,
    entityType: EntityType,
    entityId: string,
    options?: ExactGrantResolutionOptions
  ): Promise<ExactEntityGrant<EntityType> | null>
}

/** Evaluates exact grants and explicitly distinguishes cached and fresh resolution. */
export class ExactAuthorizationService<Context, EntityType extends string> {
  constructor(private readonly repository: ExactGrantRepository<Context, EntityType>) {}

  async can(
    context: Context,
    entityType: EntityType,
    entityId: string,
    action: AuthorizationAction
  ): Promise<boolean> {
    const grant = await this.repository.resolve(context, entityType, entityId)
    if (!grant) return false
    return exactEntityGrantAllows(grant, entityType, entityId, action)
  }

  async canFresh(
    context: Context,
    entityType: EntityType,
    entityId: string,
    action: AuthorizationAction
  ): Promise<boolean> {
    this.repository.assertFreshContext(context)
    const grant = await this.repository.resolve(context, entityType, entityId, { lock: true })
    if (!grant) return false
    return exactEntityGrantAllows(grant, entityType, entityId, action)
  }
}

export const resolveAssignedItemGrant = async (
  applicationUserId: string,
  entityType: Entity_Type,
  entityId: string,
  db: Kysely<Database>,
  options: ExactGrantResolutionOptions = {}
): Promise<AssignedItemGrant | null> => {
  const repository = new AssignedItemAuthorizationRepository(db)
  return await repository.resolve(applicationUserId, entityType, entityId, options)
}

export const resolveAssignedItemTargetGrant = async (
  applicationUserId: string,
  target: ExactEntityTarget<Entity_Type>,
  db: Kysely<Database>,
  options: ExactGrantResolutionOptions = {}
): Promise<AssignedItemGrant | null> => {
  const repository = new AssignedItemAuthorizationRepository(db)
  return await repository.resolveTarget(applicationUserId, target, options)
}
