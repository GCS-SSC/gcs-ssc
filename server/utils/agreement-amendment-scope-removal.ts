/* eslint-disable jsdoc/require-jsdoc -- Draft scope cleanup is called inside the authorized Agreement write transaction. */
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'

export const removeDraftAgreementAmendmentScope = async (
  trx: Transaction<Database>,
  agreementId: string,
  amendmentId: string,
  scope: { removeBudget: boolean, removeActivities: boolean }
) => {
  // Draft proposals have no approved lineage. Include already deleted draft rows
  // so removing the scope leaves no amendment-owned work behind.
  if (scope.removeBudget) {
    const versions = await trx.selectFrom('Funding_Case_Agreement_Budget_Version').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId).where('egcs_fc_iscurrent', '=', false).execute()
    const versionIds = versions.map(version => String(version.id))
    if (versionIds.length > 0) {
      const lines = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item').select('id')
        .where('egcs_fc_budgetversion', 'in', versionIds).execute()
      const lineIds = lines.map(line => String(line.id))
      if (lineIds.length > 0) {
        await trx.deleteFrom('Funding_Case_Agreement_Budget_Line_Item_Funding')
          .where('egcs_fc_budgetlineitem', 'in', lineIds).execute()
      }
      await trx.deleteFrom('Funding_Case_Agreement_Budget_Line_Item')
        .where('egcs_fc_budgetversion', 'in', versionIds).execute()
      await trx.deleteFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .where('egcs_fc_budgetversion', 'in', versionIds).execute()
      await trx.deleteFrom('Funding_Case_Agreement_Budget_Version')
        .where('id', 'in', versionIds).execute()
    }
  }
  if (scope.removeActivities) {
    const versions = await trx.selectFrom('Funding_Case_Agreement_Activity_Version').select('id')
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('egcs_fc_amendment', '=', amendmentId).where('egcs_fc_iscurrent', '=', false).execute()
    const versionIds = versions.map(version => String(version.id))
    if (versionIds.length > 0) {
      const activities = await trx.selectFrom('Funding_Case_Agreement_Activity').select('id')
        .where('egcs_fc_activityversion', 'in', versionIds).execute()
      const activityIds = activities.map(activity => String(activity.id))
      if (activityIds.length > 0) {
        await trx.deleteFrom('Funding_Case_Agreement_Outcome_Activity')
          .where('egcs_fc_activity', 'in', activityIds).execute()
        await trx.deleteFrom('Funding_Case_Agreement_Responsible_Party_Activity')
          .where('egcs_fc_activity', 'in', activityIds).execute()
      }
      await trx.deleteFrom('Funding_Case_Agreement_Activity')
        .where('egcs_fc_activityversion', 'in', versionIds).execute()
      await trx.deleteFrom('Funding_Case_Agreement_Activity_Version')
        .where('id', 'in', versionIds).execute()
    }
  }
}
