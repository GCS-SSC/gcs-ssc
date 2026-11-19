import { defineEventHandler, getRouterParam } from 'h3'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { eligibleAgreementClauses } from '~~/server/utils/agreement-clauses'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const selectionId = getRouterParam(event, 'selectionId')
  if (!id || !selectionId || !isPositivePostgresBigintText(selectionId)) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const scope = await authorizeAgreementResource(event, 'update', id, db)
  if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  return await executeFreshAuthorizedAgreementWrite(event, db, id, scope, async (trx, current) => {
    const selection = await trx.selectFrom('Funding_Case_Agreement_Clause').select('egcs_fc_clause')
      .where('id', '=', selectionId).where('egcs_fc_fundingagreement', '=', id).where('_deleted', '=', false)
      .executeTakeFirst()
    if (!selection) return await notFound(event, 'CLAUSE_NOT_SELECTED', 'agreement.clauses.not_selected')
    const version = await eligibleAgreementClauses(trx, current.streamId, current.agencyId)
      .where('clause.id', '=', selection.egcs_fc_clause).select('version.id').executeTakeFirst()
    if (!version) return await throwApiError(event, { statusCode: 409, code: 'CLAUSE_NOT_AVAILABLE', key: 'agreement.clauses.unavailable' })
    return await trx.updateTable('Funding_Case_Agreement_Clause').set({ egcs_fc_publicationversion: version.id })
      .where('id', '=', selectionId).returning('id').executeTakeFirstOrThrow()
  }, { action: 'update', blocksApprovalSubmission: true })
})
