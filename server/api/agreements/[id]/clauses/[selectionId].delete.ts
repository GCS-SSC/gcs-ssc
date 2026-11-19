import { defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'

const DeleteQuerySchema = z.object({ confirmed_protected: z.literal('true').optional() })

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const selectionId = getRouterParam(event, 'selectionId')
  if (!id || !selectionId || !isPositivePostgresBigintText(selectionId)) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const scope = await authorizeAgreementResource(event, 'delete', id, db)
  if (!scope) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const { confirmed_protected } = await getValidatedQueryI18n(event, DeleteQuerySchema)
  return await executeFreshAuthorizedAgreementWrite(event, db, id, scope, async (trx, _current, authContext) => {
    const target = trx.selectFrom('Funding_Case_Agreement_Clause')
      .where('id', '=', selectionId).where('egcs_fc_fundingagreement', '=', id).where('_deleted', '=', false)
    const current = await target.select('egcs_fc_protected').executeTakeFirst()
    if (!current) return await notFound(event, 'CLAUSE_NOT_SELECTED', 'agreement.clauses.not_selected')
    if (current.egcs_fc_protected && !confirmed_protected) {
      return await throwApiError(event, {
        statusCode: 409,
        code: 'PROTECTED_CLAUSE_CONFIRMATION_REQUIRED',
        key: 'agreement.clauses.protected_confirmation_required'
      })
    }
    const removedBy = await resolveAssignmentCommonUserId(trx, authContext.userId)
    if (!removedBy) return await badRequest(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const selection = await trx.updateTable('Funding_Case_Agreement_Clause').set({ _deleted: true, egcs_fc_removedby: removedBy })
      .where('id', '=', selectionId).where('egcs_fc_fundingagreement', '=', id).where('_deleted', '=', false)
      .returning('id').executeTakeFirst()
    if (!selection) return await notFound(event, 'CLAUSE_NOT_SELECTED', 'agreement.clauses.not_selected')
    return { success: true }
  }, { action: 'delete', blocksApprovalSubmission: true })
})
