import type {
  TransferPaymentProfileItem,
  TransferPaymentStreamItem,
  TransferPaymentOutcomeItem,
  TransferPaymentBudgetItem,
  TransferPaymentPerformanceIndicatorItem,
  TransferPaymentStreamBudgetItem,
  TransferPaymentFinancialLimitsItem
} from './schemas'
import type { Money } from '../utils/money'

export interface TransferPaymentProfileRow extends TransferPaymentProfileItem, Record<string, unknown> {
  agency_name_en?: string
  agency_name_fr?: string
}

export interface TransferPaymentStreamRow extends TransferPaymentStreamItem, Record<string, unknown> {
  parent_name_en?: string
  parent_name_fr?: string
}

export type TransferPaymentOutcomeRow = TransferPaymentOutcomeItem & Record<string, unknown>
export type TransferPaymentObjectiveRow = {
  id: string
  egcs_tp_objective_en: string
  egcs_tp_objective_fr: string
  [key: string]: unknown
}

export interface TransferPaymentBudgetRow extends Omit<TransferPaymentBudgetItem, 'egcs_tp_totalbudget'>, Record<string, unknown> {
  egcs_tp_totalbudget: Money
  fiscal_year_display?: string
  fiscal_year?: number
}

export type TransferPaymentBudgetForm = Partial<
  Omit<TransferPaymentBudgetItem, 'egcs_tp_totalbudget'> & { egcs_tp_totalbudget: string }
>

export interface TransferPaymentStreamBudgetRow extends Omit<TransferPaymentStreamBudgetItem, 'egcs_tp_totalbudget'>, Record<string, unknown> {
  egcs_tp_totalbudget: Money
  program_total_budget?: Money
  fiscal_year_display?: string
  fiscal_year?: number
}

export type TransferPaymentStreamBudgetForm = Partial<
  Omit<TransferPaymentStreamBudgetItem, 'egcs_tp_totalbudget'> & { egcs_tp_totalbudget: string }
>

export interface TransferPaymentFinancialLimitsRow extends Omit<TransferPaymentFinancialLimitsItem, 'egcs_tp_maxallowableperrecipient'> {
  egcs_tp_maxallowableperrecipient: Money
}

export type TransferPaymentFinancialLimitsForm = Partial<
  Omit<TransferPaymentFinancialLimitsItem, 'egcs_tp_maxallowableperrecipient'> & {
    egcs_tp_maxallowableperrecipient: string
  }
>

export interface TransferPaymentPerformanceIndicatorRow extends TransferPaymentPerformanceIndicatorItem, Record<string, unknown> {
  egcs_tp_transferpaymentoutcome?: string
  outcome_name_en?: string
  outcome_name_fr?: string
}

export type TransferPaymentProfileForm = Partial<Omit<TransferPaymentProfileItem, 'egcs_tp_datestart' | 'egcs_tp_dateend'> & {
  egcs_tp_datestart?: string
  egcs_tp_dateend?: string
}>
