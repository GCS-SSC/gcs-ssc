import { defineEventHandler, getRouterParam } from 'h3'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { listAgreementDocumentTemplates } from '~~/server/utils/document-generation'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

const readRoute = defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (![agreementId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')

  const agreementContext = await authorizeAgreementResource(event, 'read', agreementId, db)
  if (!agreementContext) {
    return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return {
    items: await listAgreementDocumentTemplates(agreementId, db, true)
  }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
