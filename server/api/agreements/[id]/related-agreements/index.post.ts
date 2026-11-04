import { defineEventHandler, getRouterParam } from 'h3'
import { AgreementRelationshipCreateSchema } from '~~/shared/types/schemas/agreement-relationship'
import { authorizeAgreementResource, canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { assertAgreementRelationshipType, throwAgreementRelationshipError } from '~~/server/utils/agreement-relationship'
import { badRequest } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  const body = await readValidatedBodyI18n(event, AgreementRelationshipCreateSchema)
  try {
    return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, current, auth) => {
      const target = await resolveAgreementScopeContext(body.egcs_fc_relatedagreement, trx)
      if (body.egcs_fc_relatedagreement === agreementId || !target || target.agencyId !== current.agencyId
        || !await canAccessAgreement(auth, 'read', target.scope, trx)) {
        return await badRequest(event, 'INVALID_AGREEMENT_RELATIONSHIP', 'apiErrors.agreement.invalid_relationship')
      }
      await assertAgreementRelationshipType(event, trx, current.agencyId, body.egcs_fc_relationshiptype)
      return await trx.insertInto('Funding_Case_Agreement_Relationship').values({
        egcs_fc_fundingagreement: agreementId,
        ...body
      }).returningAll().executeTakeFirstOrThrow()
    }, { action: 'create', relatedAgreementId: body.egcs_fc_relatedagreement })
  } catch (error: unknown) {
    return await throwAgreementRelationshipError(event, error)
  }
})
