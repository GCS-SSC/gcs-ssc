import { sql } from 'kysely'
import { FundingCaseIntakeCreateSchema } from '~~/shared/types/schemas'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorize, authorizeWithFreshAuthContext, requireFreshAuthContext } from '~~/server/utils/authorize'
import { resolveFundingOpportunityScope } from '~~/server/utils/funding-case'
import { canAccessApplicantRecipient } from '~~/server/utils/applicant-recipient-auth'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { badRequest, forbidden } from '~~/server/utils/api-errors'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const requested = await readValidatedBodyI18n(event, FundingCaseIntakeCreateSchema)
  const opportunityId = String(requested.egcs_fi_fundingopportunity)
  const opportunityScope = await resolveFundingOpportunityScope(db, opportunityId)
  if (!opportunityScope) return await badRequest(event, 'FUNDING_OPPORTUNITY_NOT_FOUND', 'apiErrors.admin_common.not_found')
  await authorize(event, 'funding_case', 'create', opportunityScope.scope)

  return await db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    const currentScope = await resolveFundingOpportunityScope(trx, opportunityId)
    if (!currentScope || currentScope.agencyId !== opportunityScope.agencyId
      || currentScope.transferPaymentId !== opportunityScope.transferPaymentId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_CHANGED', 'apiErrors.request.invalid')
    }
    await authorizeWithFreshAuthContext(event, auth, 'funding_case', 'create', currentScope.scope)
    const opportunity = await trx.selectFrom('Funding_Opportunity_Profile')
      .select(['egcs_fo_status', 'egcs_fo_datestart', 'egcs_fo_dateend'])
      .where('id', '=', opportunityId).where('_deleted', '=', false)
      .where('egcs_fo_datestart', '<=', sql<Date>`CURRENT_DATE`)
      .where('egcs_fo_dateend', '>=', sql<Date>`CURRENT_DATE`)
      .forUpdate().executeTakeFirst()
    if (!opportunity || opportunity.egcs_fo_status !== 'open') {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_CLOSED', 'apiErrors.request.invalid_status')
    }
    const lockedScope = await resolveFundingOpportunityScope(trx, opportunityId)
    if (!lockedScope || lockedScope.agencyId !== opportunityScope.agencyId
      || lockedScope.transferPaymentId !== opportunityScope.transferPaymentId) {
      return await badRequest(event, 'FUNDING_OPPORTUNITY_CHANGED', 'apiErrors.request.invalid')
    }
    await authorizeWithFreshAuthContext(event, auth, 'funding_case', 'create', lockedScope.scope)
    const proponentId = String(requested.egcs_fi_applicantrecipient)
    const proponent = await trx.selectFrom('Applicant_Recipient_Profile').select('id')
      .where('id', '=', proponentId).where('_deleted', '=', false)
      .forShare().executeTakeFirst()
    if (!proponent || !await canAccessApplicantRecipient(auth, proponentId, 'read', trx)) {
      return await forbidden(event)
    }
    const actorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!actorId) return await forbidden(event)
    const statusId = await lockAgencyDraftStatus(trx, lockedScope.agencyId)
    const intake = await trx.insertInto('Funding_Case_Intake_Profile').values({
      egcs_fi_applicationid: String(requested.egcs_fi_applicationid),
      egcs_fi_application: {},
      egcs_fi_fundingopportunity: opportunityId,
      egcs_fi_applicantrecipient: proponentId,
      egcs_fi_status: statusId
    }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseintake', String(intake.id), actorId)
    return intake
  })
})
