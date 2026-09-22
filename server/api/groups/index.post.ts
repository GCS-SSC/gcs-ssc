import { GroupCreateSchema } from '~~/shared/types/schemas/group'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeFresh } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const body = await readValidatedBodyI18n(event, GroupCreateSchema)
  const scope = { type: 'agency', agencyId: body.egcs_cn_agency } as const
  await authorize(event, 'group', 'create', scope)
  try {
    return await event.context.$db.transaction().execute(async trx => {
      await authorizeFresh(event, 'group', 'create', scope, trx)
      const agency = await trx.selectFrom('Agency_Profile').select('id').where('id', '=', body.egcs_cn_agency)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!agency) return await badRequest(event, 'GROUP_AGENCY_INVALID', 'apiErrors.request.invalid')
      const group = await trx.insertInto('Common_Group').values(body).returningAll().executeTakeFirstOrThrow()
      return { ...group, id: String(group.id), egcs_cn_agency: String(group.egcs_cn_agency) }
    })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return await badRequest(event, 'GROUP_EMAIL_EXISTS', 'apiErrors.user.email_exists')
    }
    throw error
  }
})
