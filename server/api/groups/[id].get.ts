import { authorizeGroup } from '~~/server/utils/groups'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const group = await authorizeGroup(event, event.context.$db, id, 'read')
  const members = await event.context.$db.selectFrom('Common_Group_Member')
    .innerJoin('Common_User', 'Common_User.id', 'Common_Group_Member.egcs_cn_user')
    .select(['Common_Group_Member.id', 'Common_Group_Member.egcs_cn_user', 'Common_User.egcs_cn_name', 'Common_User.egcs_cn_email', 'Common_User._deleted as user_deleted'])
    .where('Common_Group_Member.egcs_cn_group', '=', id).where('Common_Group_Member._deleted', '=', false)
    .orderBy('Common_User.egcs_cn_name').execute()
  return { ...group, id: String(group.id), egcs_cn_agency: String(group.egcs_cn_agency), members: members.map(member => ({ ...member, id: String(member.id), egcs_cn_user: String(member.egcs_cn_user) })) }
})
