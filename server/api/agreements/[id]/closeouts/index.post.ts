import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from '~~/server/utils/entity-assignment'
import { lockAgencyDraftStatus } from '~~/server/utils/business-status-runtime'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  const db = event.context.$db
  const context = await authorizeAgreementResource(event, 'create', agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async (trx, currentAgreement, auth) => {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Closeout').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_isopen', '=', true)
      .where('_deleted', '=', false).executeTakeFirst()
    if (existing) return await throwApiError(event, { statusCode: 409, code: 'AGREEMENT_OPEN_CLOSEOUT_EXISTS', key: 'apiErrors.agreement.open_closeout_exists' })
    const latest = await trx.selectFrom('Funding_Case_Agreement_Closeout').select('egcs_fc_closeoutnumber')
      .where('egcs_fc_fundingagreement', '=', agreementId).orderBy('egcs_fc_closeoutnumber', 'desc').executeTakeFirst()
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await notFound(event, 'COMMON_USER_NOT_FOUND', 'apiErrors.admin_common.not_found')
    const draftStatusId = await lockAgencyDraftStatus(trx, currentAgreement.agencyId)
    const closeout = await trx.insertInto('Funding_Case_Agreement_Closeout').values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_closeoutnumber: (latest?.egcs_fc_closeoutnumber ?? 0) + 1,
      egcs_fc_status: draftStatusId, egcs_fc_isopen: true, _deleted: false
    }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcaseagreementcloseout', String(closeout.id), creatorId)
    return closeout
  }, { action: 'create' })
})
