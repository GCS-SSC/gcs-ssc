import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyReadTransaction } from '~~/server/utils/agency-auth'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'id') ?? ''
  await authorize(event, 'agency', 'read', { type: 'agency', agencyId })
  return await withActiveAgencyReadTransaction(event, agencyId, async trx => {
    const result = await trx.selectFrom('Common_Review_Set_Setup')
      .select(eb => eb.fn.max('egcs_cn_order').as('maxOrder'))
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    return { nextOrder: (result?.maxOrder ?? 0) + 1 }
  })
})
