import type { H3Event } from 'h3'
import { useTranslation } from '@intlify/h3'
import { AgreementFinancialBudgetViolation, AgreementForecastRevisionRequired } from './agreement-financial-budget-controls'
import { badRequest } from './api-errors'
import { resolveRequestLocale } from './request-locale'
import { formatMoneyText } from '~~/shared/utils/money'

/**
 * Maps a domain budget failure to a localized request error after transaction rollback.
 * @param event - Authorized request.
 * @param error - Failure from the locked write.
 */
export const throwIfAgreementFinancialBudgetError = async (event: H3Event, error: unknown): Promise<void> => {
  if (error instanceof AgreementForecastRevisionRequired) {
    await badRequest(event, 'AGREEMENT_FORECAST_REVISION_REQUIRED', 'apiErrors.agreement.forecast_revision_required')
    return
  }
  if (!(error instanceof AgreementFinancialBudgetViolation)) return
  const { kind, currency, amount, budget } = error.details
  const locale = resolveRequestLocale(event)
  const t = await useTranslation(event)
  await badRequest(event, `AGREEMENT_${kind.toUpperCase()}_BUDGET_EXCEEDED`, 'apiErrors.agreement.annual_budget_exceeded', {
    document: t(`agreement.budget_controls.${kind}`),
    amount: formatMoneyText(amount, locale, currency), budget: formatMoneyText(budget, locale, currency)
  })
}
