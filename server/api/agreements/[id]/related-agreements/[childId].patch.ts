import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementRelationshipPatchSchema } from '~~/shared/types/schemas/agreement-relationship'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertAgreementRelationshipType, throwAgreementRelationshipError } from '~~/server/utils/agreement-relationship'
import { badRequest, notFound } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'update', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const childId = await parseI18n(event, PositivePostgresBigintIdSchema, getRouterParam(event, 'childId'))
  const body = await readValidatedBodyI18n(event, AgreementRelationshipPatchSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, current) => {
      const existing = await trx.selectFrom('Funding_Case_Agreement_Relationship').select('id')
        .where('id', '=', childId).where('_deleted', '=', false)
        .where(eb => eb.or([eb('egcs_fc_fundingagreement', '=', agreementId), eb('egcs_fc_relatedagreement', '=', agreementId)]))
        .forUpdate().executeTakeFirst()
      if (!existing) return await notFound(event, 'AGREEMENT_RELATIONSHIP_NOT_FOUND', 'apiErrors.agreement.relationship_not_found')
      await assertAgreementRelationshipType(event, trx, current.agencyId, body.egcs_fc_relationshiptype)
      return await trx.updateTable('Funding_Case_Agreement_Relationship').set(body).where('id', '=', existing.id)
        .returningAll().executeTakeFirstOrThrow()
    })
  } catch (error: unknown) {
    return await throwAgreementRelationshipError(event, error)
  }
})
