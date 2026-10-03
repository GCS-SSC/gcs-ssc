import { AgencyAccountReceivableTypePatchSchema, AgencyAccountReceivableTypeSchema } from '~~/shared/types/schemas/agency'
import { authorize } from '~~/server/utils/authorize'
import { withActiveAgencyMutationTransaction } from '~~/server/utils/agency-auth'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'

export default defineEventHandler(async event => {
  const agencyId = getRouterParam(event, 'agencyId')
  const typeId = getRouterParam(event, 'typeId')
  if (!agencyId || !typeId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (!isPositivePostgresBigintText(agencyId) || !isPositivePostgresBigintText(typeId)) {
    return await notFound(event, 'ACCOUNT_RECEIVABLE_TYPE_NOT_FOUND', 'apiErrors.agency.account_receivable_type_not_found')
  }
  await authorize(event, 'agency', 'update', { type: 'agency', agencyId })
  const body = await readValidatedBodyI18n(event, AgencyAccountReceivableTypePatchSchema)
  if (Object.keys(body).length === 0) return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  try {
    return await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const current = await trx.selectFrom('Agency_Account_Receivable_Type').selectAll()
        .where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'ACCOUNT_RECEIVABLE_TYPE_NOT_FOUND', 'apiErrors.agency.account_receivable_type_not_found')
      const linked = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select('id')
        .where('egcs_fc_type', '=', typeId).executeTakeFirst()
      const policyFields = ['egcs_ay_monitorrequired', 'egcs_ay_advancepaymentrelated', 'egcs_ay_claimrelated'] as const
      if (linked && policyFields.some(field => body[field] !== undefined && body[field] !== current[field])) {
        return await badRequest(event, 'ACCOUNT_RECEIVABLE_TYPE_POLICY_LOCKED', 'apiErrors.agency.account_receivable_type_policy_locked')
      }
      const { id: _id, _deleted: _deleted, egcs_ay_organizationagency: _agency, ...definition } = current
      await parseI18n(event, AgencyAccountReceivableTypeSchema, { ...definition, ...body })
      const updated = await trx.updateTable('Agency_Account_Receivable_Type').set(body).where('id', '=', typeId)
        .where('egcs_ay_organizationagency', '=', agencyId).returningAll().executeTakeFirstOrThrow()
      return { ...updated, is_in_use: Boolean(linked) }
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
})
