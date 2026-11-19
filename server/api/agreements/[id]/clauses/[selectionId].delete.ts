import { defineEventHandler, getRouterParam } from 'h3'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const selectionId = getRouterParam(event, 'selectionId')
  if (!id || !selectionId || !isPositivePostgresBigintText(selectionId)) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const scope = await authorizeAgreementResource(event, 'delete', id, db)
  if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  return await executeFreshAuthorizedAgreementWrite(event, db, id, scope, async trx => {
    const selection = await trx.updateTable('Funding_Case_Agreement_Clause').set({ _deleted: true })
      .where('id', '=', selectionId).where('egcs_fc_fundingagreement', '=', id).where('_deleted', '=', false)
      .returning('id').executeTakeFirst()
    if (!selection) return await notFound(event, 'CLAUSE_NOT_SELECTED', 'agreement.clauses.not_selected')
    return { success: true }
  }, { action: 'delete', blocksApprovalSubmission: true })
})
