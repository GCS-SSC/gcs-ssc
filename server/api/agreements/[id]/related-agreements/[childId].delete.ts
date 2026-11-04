import { defineEventHandler, getRouterParam } from 'h3'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const childId = await parseI18n(event, PositivePostgresBigintIdSchema, getRouterParam(event, 'childId'))
  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const deleted = await trx.updateTable('Funding_Case_Agreement_Relationship').set({ _deleted: true })
      .where('id', '=', childId).where('_deleted', '=', false)
      .where(eb => eb.or([eb('egcs_fc_fundingagreement', '=', agreementId), eb('egcs_fc_relatedagreement', '=', agreementId)]))
      .returning('id').executeTakeFirst()
    if (!deleted) return await notFound(event, 'AGREEMENT_RELATIONSHIP_NOT_FOUND', 'apiErrors.agreement.relationship_not_found')
    return { success: true }
  }, { action: 'delete' })
})
