import { authorizeGroup, authorizeFreshGroup } from '~~/server/utils/groups'
import { notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const userId = getRouterParam(event, 'userId') ?? ''
  await authorizeGroup(event, event.context.$db, id, 'update')
  if (!isPositivePostgresBigintText(userId)) return await notFound(event, 'GROUP_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await event.context.$db.transaction().execute(async trx => {
    await authorizeFreshGroup(event, trx, id, 'update')
    const member = await trx.updateTable('Common_Group_Member').set({ _deleted: true })
      .where('egcs_cn_group', '=', id).where('egcs_cn_user', '=', userId)
      .where('_deleted', '=', false).returning('id').executeTakeFirst()
    if (!member) return await notFound(event, 'GROUP_MEMBER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    return { id: String(member.id) }
  })
})
