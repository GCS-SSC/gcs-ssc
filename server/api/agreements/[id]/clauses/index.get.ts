import { defineEventHandler, getRouterParam } from 'h3'
import { PaginationSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { listAgreementClauseSelections } from '~~/server/utils/agreement-clauses'
import { badRequest } from '~~/server/utils/api-errors'
import { executeFreshReadSnapshot } from '~~/server/utils/fresh-read-snapshot'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  return await executeFreshReadSnapshot(event, async (db, freshAuthContext) => {
    const scope = await authorizeAgreementResource(event, 'read', id, db, { freshAuth: true, freshAuthContext })
    if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
    const { page, limit, search } = await getValidatedQueryI18n(event, PaginationSchema)
    const rows = await listAgreementClauseSelections(db, id, scope.streamId, scope.agencyId)
    const term = search?.toLowerCase()
    const matches = term ? rows.filter(row => [row.nameEn, row.nameFr, row.code].some(value => value.toLowerCase().includes(term))) : rows
    return { items: matches.slice((page - 1) * limit, page * limit), total: matches.length, page, limit }
  })
})
