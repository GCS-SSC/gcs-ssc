import type { H3Event } from 'h3'
import { useTranslation } from '@intlify/h3'
import { sql, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { TransferPaymentBudgetFundingMode } from '~~/shared/types/schemas'
import type { AuthContext } from './authorize'
import type { TransferPaymentStreamWriteContext } from './transfer-payment-write-transaction'
import { buildAgreementScope } from './agreement'
import { badRequest } from './api-errors'

/**
 * Checks all working financial records while the Stream write lock prevents concurrent changes.
 * @param event - Localizes the blocking result.
 * @param trx - Transaction holding the Stream lock.
 * @param context - Current locked Stream and Program identity.
 * @param authContext - Fresh authority to disclose individual working record references.
 * @param mode - Prospective funding mode.
 * @returns Throws a localized validation error when working records prevent the change.
 */
export const assertStreamBudgetFundingModeChange = async (
  event: H3Event,
  trx: Transaction<Database>,
  context: TransferPaymentStreamWriteContext,
  authContext: AuthContext,
  mode: TransferPaymentBudgetFundingMode
) => {
  if (mode === 'manual') return

  // Sum amounts as database NUMERIC minor units. A zero-valued source still blocks program-only mode.
  const result = await sql<{
    agreement_id: string
    agreement_number: string
    record_id: string
    kind: 'budget' | 'amendment' | 'forecast' | 'claim'
    pending: boolean
  }>`
    WITH agreements AS (
      SELECT agreement.id, agreement.egcs_fc_agreementnumber
      FROM "Funding_Case_Agreement_Profile" agreement
      JOIN "Common_Status" status ON status.id = agreement.egcs_fc_status AND NOT status._deleted
      WHERE agreement.egcs_fc_transferpaymentstream = ${context.streamId} AND NOT agreement._deleted
        AND NOT status.egcs_cn_terminal
        AND NOT EXISTS (
          SELECT 1 FROM "Common_Completion" completion
          WHERE completion.egcs_cn_entitytype = 'fundingcaseagreement'
            AND completion.egcs_cn_entityid = agreement.id AND NOT completion._deleted
        )
    ), working_lines AS (
      SELECT agreement.id AS agreement_id, agreement.egcs_fc_agreementnumber AS agreement_number,
        CASE WHEN version.egcs_fc_iscurrent THEN version.id ELSE amendment.id END AS record_id,
        CASE WHEN version.egcs_fc_iscurrent THEN 'budget' ELSE 'amendment' END AS kind,
        line.egcs_fc_programfunding AS program, line.egcs_fc_totalamount AS total,
        funding.source_count, funding.source_total, line.egcs_fc_pendingfunding AS pending
      FROM agreements agreement
      JOIN "Funding_Case_Agreement_Budget_Version" version
        ON version.egcs_fc_fundingagreement = agreement.id AND NOT version._deleted
      JOIN "Funding_Case_Agreement_Budget_Fiscal_Year" year
        ON year.egcs_fc_budgetversion = version.id AND NOT year._deleted
      JOIN "Funding_Case_Agreement_Budget_Line_Item" line
        ON line.egcs_fc_fundingagreementbudgetfiscalyear = year.id AND NOT line._deleted
      LEFT JOIN "Funding_Case_Agreement_Amendment" amendment
        ON amendment.id = version.egcs_fc_amendment AND NOT amendment._deleted
      LEFT JOIN "Common_Status" amendment_status
        ON amendment_status.id = amendment.egcs_fc_status AND NOT amendment_status._deleted
      CROSS JOIN LATERAL (
        SELECT count(*) AS source_count, coalesce(sum(source.egcs_fc_amount), 0) AS source_total
        FROM "Funding_Case_Agreement_Budget_Line_Item_Funding" source
        WHERE source.egcs_fc_budgetlineitem = line.id AND NOT source._deleted
      ) funding
      WHERE version.egcs_fc_iscurrent
        OR (amendment.egcs_fc_isopen AND NOT amendment_status.egcs_cn_terminal)

      UNION ALL

      SELECT agreement.id, agreement.egcs_fc_agreementnumber, forecast.id, 'forecast', line.egcs_fc_amount,
        line.egcs_fc_totalamount, funding.source_count, funding.source_total, false
      FROM agreements agreement
      JOIN "Funding_Case_Agreement_Forecast" forecast
        ON forecast.egcs_fc_fundingagreement = agreement.id AND NOT forecast._deleted
      JOIN "Common_Status" status ON status.id = forecast.egcs_fc_status AND NOT status._deleted
      JOIN "Funding_Case_Agreement_Forecast_Line_Item" line
        ON line.egcs_fc_agreementforecast = forecast.id AND NOT line._deleted
      CROSS JOIN LATERAL (
        SELECT count(*) AS source_count, coalesce(sum(source.egcs_fc_amount), 0) AS source_total
        FROM "Funding_Case_Agreement_Forecast_Line_Item_Funding" source
        WHERE source.egcs_fc_forecastlineitem = line.id AND NOT source._deleted
      ) funding
      WHERE NOT forecast.egcs_fc_active AND NOT status.egcs_cn_terminal AND NOT EXISTS (
        SELECT 1 FROM "Common_Completion" completion
        WHERE completion.egcs_cn_entitytype = 'fundingcaseforecast'
          AND completion.egcs_cn_entityid = forecast.id AND NOT completion._deleted
      )

      UNION ALL

      SELECT agreement.id, agreement.egcs_fc_agreementnumber, claim.id, 'claim', line.egcs_fc_amount,
        line.egcs_fc_totalamount, funding.source_count, funding.source_total, false
      FROM agreements agreement
      JOIN "Funding_Case_Agreement_Claim" claim
        ON claim.egcs_fc_fundingagreement = agreement.id AND NOT claim._deleted
      JOIN "Common_Status" status ON status.id = claim.egcs_fc_status AND NOT status._deleted
      JOIN "Funding_Case_Agreement_Claim_Line_Item" line
        ON line.egcs_fc_fundingagreementclaim = claim.id AND NOT line._deleted
      CROSS JOIN LATERAL (
        SELECT count(*) AS source_count, coalesce(sum(source.egcs_fc_amount), 0) AS source_total
        FROM "Funding_Case_Agreement_Claim_Line_Item_Funding" source
        WHERE source.egcs_fc_claimlineitem = line.id AND NOT source._deleted
      ) funding
      WHERE NOT status.egcs_cn_terminal AND NOT EXISTS (
        SELECT 1 FROM "Common_Completion" completion
        WHERE completion.egcs_cn_entitytype = 'fundingcaseagreementclaim'
          AND completion.egcs_cn_entityid = claim.id AND NOT completion._deleted
      )
    )
    SELECT agreement_id::text, agreement_number, record_id::text, kind, bool_or(pending) AS pending
    FROM working_lines
    WHERE ${mode === 'program_only'
      ? sql`source_count > 0 OR pending`
      : sql`NOT pending AND total <> program + source_total`}
    GROUP BY agreement_id, agreement_number, record_id, kind
    ORDER BY agreement_number, kind, record_id
  `.execute(trx)

  if (result.rows.length === 0) return
  const blockers = result.rows.filter(row => authContext.userAbilities.authorize(
    'agreement', 'read', buildAgreementScope(context.agencyId, context.profileId, context.streamId, row.agreement_id)
  ))
  const t = await useTranslation(event)
  const references = blockers.slice(0, 8).map(row => row.kind === 'budget'
    ? `${row.agreement_number} (${t('transfer_payment.budget_management.record_budget')})`
    : `${row.agreement_number} (${t(`transfer_payment.budget_management.record_${row.kind}`)} #${row.record_id})`)
  if (references.length < result.rows.length) {
    references.push(t('transfer_payment.budget_management.additional_records', { count: result.rows.length - references.length }))
  }
  const key = mode === 'automatic'
    ? 'apiErrors.transfer_payment.budget_total_cost_mismatch'
    : result.rows.some(row => row.pending)
      ? 'apiErrors.transfer_payment.budget_pending_funding_exists'
      : 'apiErrors.transfer_payment.budget_other_funding_exists'
  return await badRequest(event, 'STREAM_BUDGET_FUNDING_MODE_BLOCKED', key, { references: references.join('; ') })
}
