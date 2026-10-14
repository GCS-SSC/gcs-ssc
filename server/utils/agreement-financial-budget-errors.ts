import type { H3Event } from 'h3'
import { useTranslation } from '@intlify/h3'
import { AgreementFinancialBudgetViolation } from './agreement-financial-budget-controls'
import { badRequest } from './api-errors'
import { resolveRequestLocale } from './request-locale'
import { formatMoneyText } from '~~/shared/utils/money'

/**
 * Maps a domain budget failure to a localized request error after transaction rollback.
 * @param event - Authorized request.
 * @param error - Failure from the locked write.
 */
export const throwIfAgreementFinancialBudgetError = async (event: H3Event, error: unknown): Promise<void> => {
  if (!(error instanceof AgreementFinancialBudgetViolation)) return
  const { kind, fundingKind, fundingTypeId, currency, amount, budget } = error.details
  const locale = resolveRequestLocale(event)
  const t = await useTranslation(event)
  const type = fundingKind === 'other' && fundingTypeId
    ? await event.context.$db.selectFrom('Agency_Funding_Type')
        .select(['egcs_ay_name_en', 'egcs_ay_name_fr']).where('id', '=', fundingTypeId).executeTakeFirst()
    : null
  const funding = type
    ? locale === 'fr' ? type.egcs_ay_name_fr : type.egcs_ay_name_en
    : t(`agreement.budget_controls.${fundingKind}`)
  await badRequest(event, `AGREEMENT_${kind.toUpperCase()}_BUDGET_EXCEEDED`, 'apiErrors.agreement.annual_budget_exceeded', {
    document: t(`agreement.budget_controls.${kind}`), funding,
    amount: formatMoneyText(amount, locale, currency), budget: formatMoneyText(budget, locale, currency)
  })
}
