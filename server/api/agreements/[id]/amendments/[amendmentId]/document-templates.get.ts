import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAmendmentDocumentResource } from '~~/server/utils/amendment-document-generation'
import { listAgreementDocumentTemplates } from '~~/server/utils/document-generation'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, amendmentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  return await executeFreshReadSnapshot(event, async db => {
    await authorizeAmendmentDocumentResource(event, db, agreementId, amendmentId, 'read')
    return { items: await listAgreementDocumentTemplates(agreementId, db, true, 'fundingcaseamendment') }
  })
})
