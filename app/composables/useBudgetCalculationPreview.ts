import { computed, type Ref } from 'vue'
import type { FundingCaseAgreementBudgetLineItemForm, FundingCaseAgreementBudgetLineItemRow } from '~~/shared/types/funding-case-agreement-ui'
import { calculateBudgetPercentages } from '~~/shared/utils/budget-percentage'
import { parseMoney } from '~~/shared/utils/money'

/**
 * Shares the server's exact calculation using the complete budget and the draft row.
 * @param state - Current editor session.
 * @param rows - Complete budget overview.
 * @returns Reactive exact program funding preview.
 */
export const useBudgetCalculationPreview = (
  state: Ref<FundingCaseAgreementBudgetLineItemForm | null>, rows: Ref<FundingCaseAgreementBudgetLineItemRow[]>
) => computed(() => {
  const draft = state.value
  if (!draft || !draft.egcs_fc_calculationmode || draft.egcs_fc_calculationmode === 'manual') return null
  try {
    const id = draft.id ?? '__preview__'
    const candidates = [...rows.value.filter(row => row.id !== id), { ...draft, id }]
    const amounts = calculateBudgetPercentages(candidates.map(row => ({
      id: row.id!, versionId: 'preview', fiscalYearId: row.egcs_fc_fundingagreementbudgetfiscalyear!,
      currency: row.egcs_fc_currency!, categoryId: row.calculation_category_id!,
      mode: row.egcs_fc_calculationmode ?? 'manual', sourceCategoryId: row.egcs_fc_sourcecategory ?? null,
      percentage: row.egcs_fc_percentage ?? null, programFunding: parseMoney(row.egcs_fc_programfunding ?? '0')
    })))
    return amounts.get(id) ?? null
  } catch { return null }
})
