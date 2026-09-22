import { GroupPatchSchema } from '~~/shared/types/schemas/group'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeGroup, authorizeFreshGroup } from '~~/server/utils/groups'
import { badRequest } from '~~/server/utils/api-errors'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeGroup(event, event.context.$db, id, 'update')
  const body = await readValidatedBodyI18n(event, GroupPatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  try {
    return await event.context.$db.transaction().execute(async trx => {
      await authorizeFreshGroup(event, trx, id, 'update')
      const group = await trx.updateTable('Common_Group').set(body).where('id', '=', id).where('_deleted', '=', false)
        .returningAll().executeTakeFirstOrThrow()
      return { ...group, id: String(group.id), egcs_cn_agency: String(group.egcs_cn_agency) }
    })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return await badRequest(event, 'GROUP_EMAIL_EXISTS', 'apiErrors.user.email_exists')
    }
    throw error
  }
})
