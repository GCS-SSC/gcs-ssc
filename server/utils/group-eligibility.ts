/* eslint-disable jsdoc/require-jsdoc -- query-only group eligibility is shared by authoring and publication. */
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type Db = Kysely<Database> | Transaction<Database>

export const isAssignableGroup = async (db: Db, groupId: string, agencyId: string) => isPositivePostgresBigintText(groupId) && Boolean(await db
  .selectFrom('Common_Group')
  .innerJoin('Common_Group_Member', 'Common_Group_Member.egcs_cn_group', 'Common_Group.id')
  .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
  .innerJoin('user', 'user.id', 'Common_User.egcs_cn_authuserid')
  .select('Common_Group.id')
  .where('Common_Group.id', '=', groupId)
  .where('Common_Group.egcs_cn_agency', '=', agencyId)
  .where('Common_Group._deleted', '=', false)
  .where('Common_Group_Member._deleted', '=', false)
  .where('Common_User._deleted', '=', false)
  .where('user._deleted', '=', false)
  .executeTakeFirst())
