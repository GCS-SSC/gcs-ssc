import { AgencyHoldbackBasisWriteSchema } from '~~/shared/types/schemas'
import {
  authorizeActiveAgencySubentity,
  withActiveAgencyMutationTransaction
} from '~~/server/utils/agency-auth'
import { throwIfAgencyUniqueConstraintError } from '~~/server/utils/agency-unique-constraint-errors'
import { assertAgencyHoldbackBasisNotInUse } from '~~/server/utils/cost-configuration-integrity'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Holdback_Basis',
    id,
    'update',
    { code: 'HOLDBACK_BASIS_NOT_FOUND', key: 'apiErrors.agency.holdback_basis_not_found' }
  )
  const body = await readValidatedBodyI18n(event, AgencyHoldbackBasisWriteSchema.partial())
  if (Object.keys(body).length === 0) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  let result
  try {
    result = await withActiveAgencyMutationTransaction(event, agencyId, async trx => {
      const current = await trx.selectFrom('Agency_Holdback_Basis').selectAll()
        .where('id', '=', id).where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false).forUpdate().executeTakeFirst()
      if (!current) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.agency.holdback_basis_not_found')
      if (body.egcs_ay_languageindependentcode !== undefined
        && body.egcs_ay_languageindependentcode !== current.egcs_ay_languageindependentcode) {
        await assertAgencyHoldbackBasisNotInUse(event, trx, id)
      }
      return await trx
        .updateTable('Agency_Holdback_Basis')
        .set(body)
        .where('id', '=', id)
        .where('egcs_ay_organizationagency', '=', agencyId)
        .where('_deleted', '=', false)
        .returningAll()
        .executeTakeFirst()
    })
  } catch (error: unknown) {
    await throwIfAgencyUniqueConstraintError(event, error)
    throw error
  }
  if (!result) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.agency.holdback_basis_not_found')
  return result
})
