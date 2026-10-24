import { defineEventHandler, getRouterParam } from 'h3'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { PaginationSchema } from '~~/shared/types/schemas'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { listAgreementGeneratedDocumentPage } from '~~/server/utils/document-generation'

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

  const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
  const { items, total } = await listAgreementGeneratedDocumentPage(agreementId, db, { page, limit, search })

  return {
    items,
    total,
    stats: {
      total
    },
    page,
    limit
  }
})

export default defineEventHandler(async event =>
  await executeFreshReadSnapshot(event, async () => await readRoute(event)))
