import { badRequest } from '~~/server/utils/api-errors'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import { assertDraftAgreementAmendment } from '~~/server/utils/agreement-amendment'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

export default defineEventHandler(async event => {
  const db = event.context.$db
  const agreementId = getRouterParam(event, 'id')
  const amendmentId = getRouterParam(event, 'amendmentId')
  if (!agreementId || !amendmentId) return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  if (!isPositivePostgresBigintText(agreementId) || !isPositivePostgresBigintText(amendmentId)) {
    return await badRequest(event, 'INVALID_ID', 'apiErrors.request.invalid')
  }
  const context = await authorizeAgreementResource(event, 'delete', agreementId, db)
  if (!context) return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, context, async trx => {
    const amendment = await assertDraftAgreementAmendment(event, trx, agreementId, amendmentId)
    if (!('id' in amendment)) return amendment

    const budgetVersions = await trx.selectFrom('Funding_Case_Agreement_Budget_Version')
      .select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId)
      .execute()
    const budgetVersionIds = budgetVersions.map(version => version.id)
    if (budgetVersionIds.length > 0) {
      const fiscalYears = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .select('id')
        .where('egcs_fc_budgetversion', 'in', budgetVersionIds)
        .execute()
      const fiscalYearIds = fiscalYears.map(fiscalYear => fiscalYear.id)
      if (fiscalYearIds.length > 0) {
        await trx.updateTable('Funding_Case_Agreement_Budget_Line_Item')
          .set({ _deleted: true })
          .where('egcs_fc_fundingagreementbudgetfiscalyear', 'in', fiscalYearIds)
          .where('_deleted', '=', false)
          .execute()
        await trx.updateTable('Funding_Case_Agreement_Budget_Fiscal_Year')
          .set({ _deleted: true })
          .where('id', 'in', fiscalYearIds)
          .where('_deleted', '=', false)
          .execute()
      }
    }

    const activityVersions = await trx.selectFrom('Funding_Case_Agreement_Activity_Version')
      .select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId)
      .execute()
    const activityVersionIds = activityVersions.map(version => version.id)
    if (activityVersionIds.length > 0) {
      const activities = await trx.selectFrom('Funding_Case_Agreement_Activity')
        .select('id')
        .where('egcs_fc_activityversion', 'in', activityVersionIds)
        .execute()
      const activityIds = activities.map(activity => activity.id)
      if (activityIds.length > 0) {
        await trx.updateTable('Funding_Case_Agreement_Outcome_Activity')
          .set({ _deleted: true })
          .where('egcs_fc_activity', 'in', activityIds)
          .where('_deleted', '=', false)
          .execute()
        await trx.updateTable('Funding_Case_Agreement_Responsible_Party_Activity')
          .set({ _deleted: true })
          .where('egcs_fc_activity', 'in', activityIds)
          .where('_deleted', '=', false)
          .execute()
        await trx.updateTable('Funding_Case_Agreement_Activity')
          .set({ _deleted: true })
          .where('id', 'in', activityIds)
          .where('_deleted', '=', false)
          .execute()
      }
    }

    await trx.updateTable('Funding_Case_Agreement_Budget_Version')
      .set({ egcs_fc_iscurrent: false, _deleted: true })
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false)
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Activity_Version')
      .set({ _deleted: true })
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false)
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Amendment_Type')
      .set({ _deleted: true })
      .where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false)
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Amendment_Subtype')
      .set({ _deleted: true })
      .where('egcs_fc_amendment', '=', amendmentId)
      .where('_deleted', '=', false)
      .execute()
    await trx.updateTable('Funding_Case_Agreement_Amendment')
      .set({ _deleted: true })
      .where('id', '=', amendmentId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()
    return { success: true }
  }, {
    action: 'delete',
    assignmentTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId },
    businessStatusTarget: { entityType: 'fundingcaseamendment', entityId: amendmentId }
  })
})
