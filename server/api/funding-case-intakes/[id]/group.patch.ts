import { z } from 'zod'
import { requireAuthContext } from '~~/server/utils/authorize'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { executeEntityAssignmentManagement } from '~~/server/utils/entity-assignment-write'
import { lockAssignableGroup } from '~~/server/utils/groups'
import { resolveFundingCaseScope } from '~~/server/utils/funding-case'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

const Body = z.object({ egcs_fi_group: PositivePostgresBigintIdSchema.nullable() }).strict()

export default defineEventHandler(async event => {
  await requireAuthContext(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
  const body = await readValidatedBodyI18n(event, Body)
  return await executeEntityAssignmentManagement(event, { entityType: 'fundingcaseintake', entityId: id }, async trx => {
    const scope = await resolveFundingCaseScope(trx, id)
    if (!scope) return await notFound(event, 'FUNDING_CASE_INTAKE_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (body.egcs_fi_group && !await lockAssignableGroup(trx, String(body.egcs_fi_group), scope.agencyId)) {
      return await badRequest(event, 'FUNDING_CASE_INTAKE_GROUP_INVALID', 'apiErrors.request.invalid')
    }
    if (!body.egcs_fi_group) {
      const assigned = await trx.selectFrom('Common_Entity_Assignment').select('id')
        .where('egcs_cn_entitytype', '=', 'fundingcaseintake').where('egcs_cn_entityid', '=', id)
        .where('_deleted', '=', false).executeTakeFirst()
      if (!assigned) return await badRequest(event, 'ASSIGNMENT_REQUIRED', 'apiErrors.request.invalid')
    }
    const updated = await trx.updateTable('Funding_Case_Intake_Profile').set({
      egcs_fi_group: body.egcs_fi_group ? String(body.egcs_fi_group) : null,
      egcs_fi_groupclaimedby: null
    }).where('id', '=', id).returning(['id', 'egcs_fi_group', 'egcs_fi_groupclaimedby']).executeTakeFirstOrThrow()
    return { id: String(updated.id), egcs_fi_group: updated.egcs_fi_group ? String(updated.egcs_fi_group) : null,
      egcs_fi_groupclaimedby: null }
  })
})
