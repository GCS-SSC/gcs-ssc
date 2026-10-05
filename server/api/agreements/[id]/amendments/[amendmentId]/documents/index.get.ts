import { badRequest } from '~~/server/utils/api-errors'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { authorizeAmendmentDocumentResource } from '~~/server/utils/amendment-document-generation'
import { listAgreementGeneratedDocumentPage } from '~~/server/utils/document-generation'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { PaginationSchema } from '~~/shared/types/schemas'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_IDS', 'apiErrors.request.missing_ids')
  if (![agreementId, amendmentId].every(isPositivePostgresBigintText)) return await badRequest(event, 'INVALID_IDS', 'apiErrors.request.invalid')
  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  return await executeFreshReadSnapshot(event, async db => {
    await authorizeAmendmentDocumentResource(event, db, agreementId, amendmentId, 'read')
    const { items, total } = await listAgreementGeneratedDocumentPage(agreementId, db, { page, limit, search, amendmentId })
    return { items, total, stats: { total }, page, limit }
  })
})
