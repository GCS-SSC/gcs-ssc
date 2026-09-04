import type { H3Event } from 'h3'
import { parseI18n } from './api-validate'
import {
  FundingCaseAgreementBudgetLineItemFundingTotalsSchema,
  FundingCaseAgreementPeriodRangeSchema,
  type FundingCaseAgreementBudgetLineItemPatch,
  type FundingCaseAgreementClaimPatch,
  type FundingCaseAgreementPaymentPatch
} from '~~/shared/types/schemas'
import type { Money } from '~~/shared/utils/money'

type BudgetFundingState = {
  egcs_fc_totalamount: Money | string
  egcs_fc_programfunding: Money | string
  egcs_fc_otherfederalfunding: Money | string | null | undefined
  egcs_fc_othergovfunding: Money | string | null | undefined
  egcs_fc_otherfunding: Money | string | null | undefined
}

type PeriodState = {
  egcs_fc_periodstart: number
  egcs_fc_periodend: number
}

/**
 * Validates a sparse Budget line patch against its complete locked funding state.
 *
 * @param event - Current request event used for localized validation errors.
 * @param existing - Complete persisted funding values read under lock.
 * @param patch - Validated sparse request body.
 * @returns The validated merged funding state.
 */
export const validateMergedBudgetLineItemFundingPatch = async (
  event: H3Event,
  existing: BudgetFundingState,
  patch: FundingCaseAgreementBudgetLineItemPatch
) => await parseI18n(event, FundingCaseAgreementBudgetLineItemFundingTotalsSchema, {
  egcs_fc_totalamount: patch.egcs_fc_totalamount ?? existing.egcs_fc_totalamount,
  egcs_fc_programfunding: patch.egcs_fc_programfunding ?? existing.egcs_fc_programfunding,
  egcs_fc_otherfederalfunding: patch.egcs_fc_otherfederalfunding ?? existing.egcs_fc_otherfederalfunding,
  egcs_fc_othergovfunding: patch.egcs_fc_othergovfunding ?? existing.egcs_fc_othergovfunding,
  egcs_fc_otherfunding: patch.egcs_fc_otherfunding ?? existing.egcs_fc_otherfunding
})

/**
 * Validates a sparse Claim or Payment patch against its complete locked period.
 *
 * @param event - Current request event used for localized validation errors.
 * @param existing - Complete persisted period read under lock.
 * @param patch - Validated sparse request body.
 * @returns The validated merged period state.
 */
export const validateMergedFinancialPeriodPatch = async (
  event: H3Event,
  existing: PeriodState,
  patch: FundingCaseAgreementClaimPatch | FundingCaseAgreementPaymentPatch
) => await parseI18n(event, FundingCaseAgreementPeriodRangeSchema, {
  egcs_fc_periodstart: patch.egcs_fc_periodstart ?? existing.egcs_fc_periodstart,
  egcs_fc_periodend: patch.egcs_fc_periodend ?? existing.egcs_fc_periodend
})
