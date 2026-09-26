import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingCaseAccess } from '~~/server/utils/funding-case-access'
import { assertBusinessStatusMutationAllowed } from '~~/server/utils/business-status-runtime'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const db = event.context.$db
  await requireFundingCaseAccess(event, id, 'delete', db)
  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await requireFundingCaseAccess(event, id, 'delete', trx, auth)
    await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseintake', id, 'ordinary')
    const runtime = await trx.selectFrom('Common_Runtime').select('id')
      .where('egcs_cn_entitytype', '=', 'fundingcaseintake').where('egcs_cn_entityid', '=', id)
      .executeTakeFirst()
    if (runtime) return await badRequest(event, 'FUNDING_CASE_INTAKE_HAS_RUNTIME', 'apiErrors.request.invalid_status')
    await trx.updateTable('Funding_Case_Intake_Profile').set({ _deleted: true }).where('id', '=', id).execute()
    await trx.updateTable('Common_Entity').set({ _deleted: true }).where('id', '=', id)
      .where('egcs_cn_entitytype', '=', 'fundingcaseintake').execute()
    return { success: true }
  })
})
