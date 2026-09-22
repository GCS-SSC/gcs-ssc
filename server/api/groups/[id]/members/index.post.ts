import { GroupMemberSchema } from '~~/shared/types/schemas/group'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeGroup, authorizeFreshGroup, listAgencyGroupUsers } from '~~/server/utils/groups'
import { badRequest } from '~~/server/utils/api-errors'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const group = await authorizeGroup(event, event.context.$db, id, 'update')
  const body = await readValidatedBodyI18n(event, GroupMemberSchema)
  return await event.context.$db.transaction().execute(async trx => {
    await authorizeFreshGroup(event, trx, id, 'update')
    const eligible = await listAgencyGroupUsers(trx, String(group.egcs_cn_agency))
    if (!eligible.some(user => user.id === body.egcs_cn_user)) {
      return await badRequest(event, 'GROUP_MEMBER_INVALID', 'apiErrors.request.invalid')
    }
    const existing = await trx.selectFrom('Common_Group_Member').select('id')
      .where('egcs_cn_group', '=', id).where('egcs_cn_user', '=', body.egcs_cn_user)
      .where('_deleted', '=', false).executeTakeFirst()
    if (existing) return await badRequest(event, 'GROUP_MEMBER_DUPLICATE', 'apiErrors.request.invalid')
    const member = await trx.insertInto('Common_Group_Member').values({
      egcs_cn_group: id, egcs_cn_user: body.egcs_cn_user, _deleted: false
    }).returningAll().executeTakeFirstOrThrow()
    return { ...member, id: String(member.id), egcs_cn_group: String(member.egcs_cn_group), egcs_cn_user: String(member.egcs_cn_user) }
  })
})
