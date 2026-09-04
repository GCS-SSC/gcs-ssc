import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }
  if (!isPositivePostgresBigintText(childId)) {
    return await badRequest(event, 'AGREEMENT_ACTIVITY_NOT_FOUND', 'apiErrors.agreement.activity_not_found')
  }

  const agreementContext = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
    const agreement = await assertAgreementExists(event, agreementId, trx)
    if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
      return agreement
    }

    const existing = await assertAgreementChildExists(
      event,
      trx
        .selectFrom('Funding_Case_Agreement_Activity')
        .innerJoin(
          'Funding_Case_Agreement_Activity_Version',
          'Funding_Case_Agreement_Activity_Version.id',
          'Funding_Case_Agreement_Activity.egcs_fc_activityversion'
        )
        .where('Funding_Case_Agreement_Activity.id', '=', childId)
        .where('Funding_Case_Agreement_Activity.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Activity._deleted', '=', false)
        .where('Funding_Case_Agreement_Activity_Version.egcs_fc_iscurrent', '=', true)
        .where('Funding_Case_Agreement_Activity_Version._deleted', '=', false)
        .select('Funding_Case_Agreement_Activity.id as id')
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.activityNotFound
    )
    if (!existing || typeof existing !== 'object' || !('id' in existing)) {
      return existing
    }

    await trx
      .updateTable('Funding_Case_Agreement_Outcome_Activity')
      .set({ _deleted: true })
      .where('egcs_fc_activity', '=', childId)
      .where('_deleted', '=', false)
      .execute()

    await trx
      .updateTable('Funding_Case_Agreement_Responsible_Party_Activity')
      .set({ _deleted: true })
      .where('egcs_fc_activity', '=', childId)
      .where('_deleted', '=', false)
      .execute()

    await trx
      .updateTable('Funding_Case_Agreement_Activity')
      .set({ _deleted: true })
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()

    return { success: true }
  }, { action: 'delete', blocksApprovalSubmission: true })
})
