import { authorize } from '~~/server/utils/authorize'
import { resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { patchAgreementProfile } from '~~/server/utils/agreement-profile-routes'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const id = getRouterParam(event, 'id')

  if (!id) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const existingContext = await resolveAgreementScopeContext(id, db)
  if (!existingContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  // Authenticate at the route boundary; authorization is evaluated against the locked current scope.
  await authorize(event, 'agreement', 'update', async () => ({ bypass: true }))

  return await patchAgreementProfile(event, db, id, existingContext)
})
