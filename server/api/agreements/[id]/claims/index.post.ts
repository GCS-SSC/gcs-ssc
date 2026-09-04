import { FundingCaseAgreementClaimCreateSchema } from '~~/shared/types/schemas'
import {
  createAgreementClaimAggregate,
  prepareAgreementClaimRoute
} from '~~/server/utils/agreement-claim'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { BusinessStatusViolation } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const prepared = await prepareAgreementClaimRoute(event, 'create')
  if (!prepared || !('agreementId' in prepared)) {
    return prepared
  }

  const { agreementId, agreementContext, db } = prepared
  const validated = await readValidatedBodyI18n(event, FundingCaseAgreementClaimCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async (trx, current, auth) => {
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const result = await createAgreementClaimAggregate(trx, {
      agreementId,
      streamId: current.streamId,
      fiscalYearId: validated.egcs_fc_fiscalyear,
      isFinalForYear: validated.egcs_fc_isfinalforyear,
      periodStart: validated.egcs_fc_periodstart,
      periodEnd: validated.egcs_fc_periodend,
      receivedDate: validated.egcs_fc_receiveddate,
      submissionUuid: null,
      lineItems: []
    }, current.agencyId, creatorId)
    if (result.status === 'fiscal_year_unavailable') {
      return await badRequest(event, 'INVALID_AGREEMENT_CLAIM_FISCAL_YEAR', 'apiErrors.agreement.invalid_claim_fiscal_year')
    }
    if (result.status !== 'created') {
      throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Agency Draft status is unavailable')
    }
    return result.claim
  }, { action: 'create' })
})
