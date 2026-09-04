import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { sql } from 'kysely'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { parseMoney, subtractMoney, sumMoney, type Money } from '~~/shared/utils/money'

export interface AgreementAmendmentBudgetDifference {
  previousTotal: Money
  amendedTotal: Money
  difference: Money
  currency: string
}

/**
 * Calculates each amendment snapshot total against the approved version it cloned.
 *
 * @param db - Agreement database connection or transaction.
 * @param agreementId - Parent agreement identifier.
 * @param amendmentIds - Amendment identifiers whose budget snapshots should be compared.
 * @returns Budget differences keyed by amendment identifier.
 */
export const getAgreementAmendmentBudgetDifferences = async (
  db: Kysely<Database> | Transaction<Database>,
  agreementId: string,
  amendmentIds: string[]
): Promise<Map<string, AgreementAmendmentBudgetDifference[]>> => {
  if (amendmentIds.length === 0) return new Map()

  const versions = await db.selectFrom('Funding_Case_Agreement_Budget_Version')
    .select(['id', 'egcs_fc_amendment', 'egcs_fc_sourceversion'])
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_amendment', 'in', amendmentIds)
    .where('_deleted', '=', false)
    .execute()
  const versionIds = [...new Set(versions.flatMap(version => [
    String(version.id),
    ...(version.egcs_fc_sourceversion ? [String(version.egcs_fc_sourceversion)] : [])
  ]))]
  if (versionIds.length === 0) return new Map()

  const lineItems = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .select([
      'egcs_fc_budgetversion',
      databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
      'egcs_fc_currency'
    ])
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_budgetversion', 'in', versionIds)
    .where('_deleted', '=', false)
    .execute()
  const amounts = new Map<string, Map<string, Money[]>>()
  for (const lineItem of lineItems) {
    const versionId = String(lineItem.egcs_fc_budgetversion)
    const currency = lineItem.egcs_fc_currency.toLowerCase()
    const versionAmounts = amounts.get(versionId) ?? new Map<string, Money[]>()
    versionAmounts.set(currency, [...(versionAmounts.get(currency) ?? []), parseDatabaseMoney(lineItem.egcs_fc_totalamount)])
    amounts.set(versionId, versionAmounts)
  }

  return new Map(versions.flatMap(version => {
    if (!version.egcs_fc_amendment || !version.egcs_fc_sourceversion) return []
    const amendmentVersionId = String(version.id)
    const sourceVersionId = String(version.egcs_fc_sourceversion)
    const amendmentAmounts = amounts.get(amendmentVersionId) ?? new Map<string, Money[]>()
    const sourceAmounts = amounts.get(sourceVersionId) ?? new Map<string, Money[]>()
    const combinedCurrencies = [...new Set([...amendmentAmounts.keys(), ...sourceAmounts.keys()])].sort()
    return [[String(version.egcs_fc_amendment), combinedCurrencies.map(currency => {
      const previousTotal = sumMoney(sourceAmounts.get(currency) ?? [parseMoney('0')])
      const amendedTotal = sumMoney(amendmentAmounts.get(currency) ?? [parseMoney('0')])
      return { previousTotal, amendedTotal, difference: subtractMoney(amendedTotal, previousTotal), currency }
    })] as const]
  }))
}
