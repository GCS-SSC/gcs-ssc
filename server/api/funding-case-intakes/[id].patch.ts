import { FundingCaseIntakePatchSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { requireAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { requireFundingCaseAccess } from '~~/server/utils/funding-case-access'
import { assertBusinessStatusMutationAllowed } from '~~/server/utils/business-status-runtime'
import { notFound } from '~~/server/utils/api-errors'
import type { JsonValue } from '~~/shared/types/database'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id')
  if (!id) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const requested = await readValidatedBodyI18n(event, FundingCaseIntakePatchSchema)
  const db = event.context.$db
  await requireFundingCaseAccess(event, id, 'update', db)
  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    await requireFundingCaseAccess(event, id, 'update', trx, auth)
    await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseintake', id, 'ordinary')
    if (!requested.egcs_fi_application) {
      return await trx.selectFrom('Funding_Case_Intake_Profile').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    }
    return await trx.updateTable('Funding_Case_Intake_Profile')
      .set({ egcs_fi_application: requested.egcs_fi_application as Record<string, JsonValue> })
      .where('id', '=', id).where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()
  })
})
