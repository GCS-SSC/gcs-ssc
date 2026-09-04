import { authorizeActiveAgencySubentity, softDeleteActiveAgencySubentity } from '~~/server/utils/agency-auth'
import { assertAgencyHoldbackBasisNotInUse } from '~~/server/utils/cost-configuration-integrity'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const { agencyId } = await authorizeActiveAgencySubentity(
    event,
    'Agency_Holdback_Basis',
    id,
    'delete',
    { code: 'HOLDBACK_BASIS_NOT_FOUND', key: 'apiErrors.agency.holdback_basis_not_found' }
  )
  const deleted = await db.transaction().execute(async trx => {
    return await softDeleteActiveAgencySubentity(
      event,
      trx,
      'Agency_Holdback_Basis',
      id,
      agencyId,
      async lockedTrx => await assertAgencyHoldbackBasisNotInUse(event, lockedTrx, id)
    )
  })
  if (!deleted) return await notFound(event, 'HOLDBACK_BASIS_NOT_FOUND', 'apiErrors.agency.holdback_basis_not_found')
  return { success: true }
})
