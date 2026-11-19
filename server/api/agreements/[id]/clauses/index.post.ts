import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementClauseSelectionSchema } from '~~/shared/types/schemas/agreement-clause'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { eligibleAgreementClauses } from '~~/server/utils/agreement-clauses'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, throwApiError } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  if (!id) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const scope = await authorizeAgreementResource(event, 'create', id, db)
  if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const { egcs_fc_clause } = await readValidatedBodyI18n(event, AgreementClauseSelectionSchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, id, scope, async (trx, current) => {
    const version = await eligibleAgreementClauses(trx, current.streamId, current.agencyId)
      .where('clause.id', '=', egcs_fc_clause).select('version.id').executeTakeFirst()
    if (!version) return await throwApiError(event, { statusCode: 409, code: 'CLAUSE_NOT_AVAILABLE', key: 'agreement.clauses.unavailable' })
    const selected = await trx.selectFrom('Funding_Case_Agreement_Clause').select('id')
      .where('egcs_fc_fundingagreement', '=', id).where('egcs_fc_clause', '=', egcs_fc_clause).where('_deleted', '=', false)
      .executeTakeFirst()
    if (selected) return await throwApiError(event, { statusCode: 409, code: 'CLAUSE_ALREADY_SELECTED', key: 'agreement.clauses.already_selected' })
    return await trx.insertInto('Funding_Case_Agreement_Clause').values({
      egcs_fc_fundingagreement: id,
      egcs_fc_clause,
      egcs_fc_publicationversion: version.id
    }).returning('id').executeTakeFirstOrThrow()
  }, { action: 'create', blocksApprovalSubmission: true })
})
