import { authorizeGroup, listAgencyGroupUsers } from '~~/server/utils/groups'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  const group = await authorizeGroup(event, event.context.$db, id, 'update')
  const users = await listAgencyGroupUsers(event.context.$db, String(group.egcs_cn_agency))
  return { items: users.map(user => ({ id: user.id, egcs_cn_name_en: user.name, egcs_cn_name_fr: user.name })) }
})
