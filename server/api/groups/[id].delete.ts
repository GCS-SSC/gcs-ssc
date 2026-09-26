import { authorizeGroup, authorizeFreshGroup } from '~~/server/utils/groups'
import { badRequest } from '~~/server/utils/api-errors'

// eslint-disable-next-line local/require-authorize -- authorizeGroup applies the agency-scoped group grant.
export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id') ?? ''
  await authorizeGroup(event, event.context.$db, id, 'delete')
  return await event.context.$db.transaction().execute(async trx => {
    await authorizeFreshGroup(event, trx, id, 'delete')
    await trx.selectFrom('Common_Group').select('id').where('id', '=', id)
      .where('_deleted', '=', false).forUpdate().executeTakeFirstOrThrow()
    const references = await Promise.all([
      trx.selectFrom('Common_Review').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Review_Setup').select('id').where('egcs_cn_defaultgroup', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Approval_Step').select('id').where('egcs_cn_defaultgroup', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Common_Approval').select('id').where('egcs_cn_assignedgroup', '=', id).executeTakeFirst(),
      trx.selectFrom('Common_Approval').select('id').where('egcs_cn_defaultgroup', '=', id).executeTakeFirst(),
      trx.selectFrom('Common_Additional_Reviewers').select('id').where('egcs_cn_group', '=', id).where('_deleted', '=', false).executeTakeFirst(),
      trx.selectFrom('Funding_Case_Intake_Profile').select('id')
        .where('egcs_fi_group', '=', id).where('_deleted', '=', false).executeTakeFirst()
    ])
    if (references.some(Boolean)) return await badRequest(event, 'GROUP_IN_USE', 'apiErrors.request.invalid')
    await trx.updateTable('Common_Group_Member').set({ _deleted: true }).where('egcs_cn_group', '=', id).where('_deleted', '=', false).execute()
    await trx.updateTable('Common_Group').set({ _deleted: true }).where('id', '=', id).execute()
    return { id }
  })
})
