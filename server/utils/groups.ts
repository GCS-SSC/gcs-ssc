/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Small authorization helpers have explicit names and types. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { authorize, authorizeFresh } from './authorize'
import { notFound } from './api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type Db = Kysely<Database> | Transaction<Database>

export const requireGroup = async (event: H3Event, db: Db, id: string) => {
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'GROUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const group = await db.selectFrom('Common_Group').selectAll().where('id', '=', id)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!group) return await notFound(event, 'GROUP_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return group
}

export const authorizeGroup = async (
  event: H3Event,
  db: Db,
  id: string,
  action: 'read' | 'update' | 'delete'
) => {
  const group = await requireGroup(event, db, id)
  await authorize(event, 'group', action, { type: 'agency', agencyId: String(group.egcs_cn_agency) })
  return group
}

export const authorizeFreshGroup = async (
  event: H3Event,
  trx: Transaction<Database>,
  id: string,
  action: 'update' | 'delete'
) => {
  const group = await requireGroup(event, trx, id)
  await authorizeFresh(event, 'group', action, { type: 'agency', agencyId: String(group.egcs_cn_agency) }, trx)
  return group
}

/** Checks the active group and member together; it never creates a business-data grant. */
export const isActiveGroupMember = async (db: Db, groupId: string, commonUserId: string) => Boolean(await db
  .selectFrom('Common_Group_Member')
  .innerJoin('Common_Group', 'Common_Group.id', 'Common_Group_Member.egcs_cn_group')
  .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
  .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
  .select('Common_Group_Member.id')
  .where('Common_Group_Member.egcs_cn_group', '=', groupId)
  .where('Common_Group_Member.egcs_cn_user', '=', commonUserId)
  .where('Common_Group_Member._deleted', '=', false)
  .where('Common_Group._deleted', '=', false)
  .where('Common_User._deleted', '=', false)
  .where('user._deleted', '=', false)
  .executeTakeFirst())

export const isAssignableGroup = async (db: Db, groupId: string, agencyId: string) => Boolean(await db
  .selectFrom('Common_Group')
  .innerJoin('Common_Group_Member', 'Common_Group_Member.egcs_cn_group', 'Common_Group.id')
  .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
  .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
  .select('Common_Group.id')
  .where('Common_Group.id', '=', groupId)
  .where('Common_Group.egcs_cn_agency', '=', agencyId)
  .where('Common_Group._deleted', '=', false)
  .where('Common_Group_Member._deleted', '=', false)
  .where('Common_User._deleted', '=', false)
  .where('user._deleted', '=', false)
  .executeTakeFirst())

/** Holds an active Agency group through a transaction that creates a group-only business item. */
export const lockAssignableGroup = async (trx: Transaction<Database>, groupId: string, agencyId: string): Promise<boolean> => {
  const group = await trx.selectFrom('Common_Group').select('id')
    .where('id', '=', groupId).where('egcs_cn_agency', '=', agencyId)
    .where('_deleted', '=', false).forShare().executeTakeFirst()
  return Boolean(group && await isAssignableGroup(trx, groupId, agencyId))
}

/** Users with an active role explicitly owned by this agency can join its groups. */
export const listAgencyGroupUsers = async (db: Db, agencyId: string): Promise<Array<{ id: string; name: string }>> => {
  const users = await db.selectFrom('Common_User')
    .innerJoin('user', 'user.id', 'Common_User.egcs_cn_auth_user_id')
    .innerJoin('user_role_assignment', 'user_role_assignment.user_id', 'user.id')
    .innerJoin('role', 'role.id', 'user_role_assignment.role_id')
    .select(['Common_User.id as id', 'Common_User.egcs_cn_name as name'])
    .where('Common_User._deleted', '=', false)
    .where('user._deleted', '=', false)
    .where('user_role_assignment._deleted', '=', false)
    .where('role._deleted', '=', false)
    .where('role.agency_id', '=', agencyId)
    .distinct()
    .orderBy('Common_User.egcs_cn_name')
    .execute()
  return users.map(user => ({ id: String(user.id), name: user.name }))
}
