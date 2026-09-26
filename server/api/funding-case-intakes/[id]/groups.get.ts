import { requireAuthContext } from '~~/server/utils/authorize'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { resolveFundingCaseScope } from '~~/server/utils/funding-case'
import { notFound } from '~~/server/utils/api-errors'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  return await executeEntityAssignmentManagement(event, { entityType: 'fundingcaseintake', entityId: id }, async trx => {
    const scope = await resolveFundingCaseScope(trx, id)
    if (!scope) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const groups = await trx.selectFrom('Common_Group').select(['id', 'egcs_cn_name_en', 'egcs_cn_name_fr'])
      .where('egcs_cn_agency', '=', scope.agencyId).where('_deleted', '=', false)
      .orderBy('egcs_cn_name_en').execute()
    return { items: groups.map(group => ({ ...group, id: String(group.id) })) }
  })
})
