/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Narrow funding helpers use descriptive signatures. */
import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import type { Money } from '~~/shared/utils/money'
import { databaseMoneyValue } from '~~/server/utils/database-money'
import { badRequest } from '~~/server/utils/api-errors'
import { compareMoney, parseMoney, sumMoney } from '~~/shared/utils/money'

export type AgreementFundingSourceInput = {
  egcs_fc_fundingsubtype: string
  egcs_fc_amount: Money
}

type FundingTarget =
  | { kind: 'forecast', lineId: string }
  | { kind: 'claim', lineId: string }

/** Applies the exact program plus other-source arithmetic for a collection of lines. */
export const areLineFundingAmountsComplete = (
  lines: Array<{ id: string, egcs_fc_amount: string | number, egcs_fc_totalamount: string | number }>,
  sources: Array<{ lineId: string, egcs_fc_amount: string | number }>,
  options: { requireSource: boolean }
): boolean => {
  const amountsByLine = new Map<string, Money[]>()
  for (const source of sources) {
    const key = String(source.lineId)
    const amounts = amountsByLine.get(key) ?? []
    amounts.push(parseMoney(source.egcs_fc_amount))
    amountsByLine.set(key, amounts)
  }
  return lines.every(line => {
    const amounts = amountsByLine.get(String(line.id)) ?? []
    if (options.requireSource && amounts.length === 0) return false
    return compareMoney(
      sumMoney([parseMoney(line.egcs_fc_amount), ...amounts]),
      parseMoney(line.egcs_fc_totalamount)
    ) === 0
  })
}

/** Replaces the active other-source allocations for one editable financial line. */
export const replaceAgreementLineFunding = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  target: FundingTarget,
  sources: AgreementFundingSourceInput[]
) => {
  const ids = sources.map(source => source.egcs_fc_fundingsubtype)
  if (new Set(ids).size !== ids.length) {
    return await badRequest(event, 'AGREEMENT_FUNDING_SUBTYPE_DUPLICATE', 'apiErrors.agreement.funding_subtype_invalid')
  }

  if (ids.length > 0) {
    const available = await trx.selectFrom('Transfer_Payment_Stream_Funding_Subtype')
      .innerJoin('Funding_Case_Agreement_Profile',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream',
        'Transfer_Payment_Stream_Funding_Subtype.egcs_tp_transferpaymentstream')
      .innerJoin('Agency_Funding_Subtype',
        'Agency_Funding_Subtype.id',
        'Transfer_Payment_Stream_Funding_Subtype.egcs_tp_fundingsubtype')
      .innerJoin('Agency_Funding_Type', 'Agency_Funding_Type.id', 'Agency_Funding_Subtype.egcs_ay_fundingtype')
      .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Transfer_Payment_Stream_Funding_Subtype.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
      .where('Funding_Case_Agreement_Profile.id', '=', agreementId)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .where('Transfer_Payment_Stream_Funding_Subtype.egcs_tp_fundingsubtype', 'in', ids)
      .where('Transfer_Payment_Stream_Funding_Subtype._deleted', '=', false)
      .where('Agency_Funding_Subtype._deleted', '=', false)
      .where('Agency_Funding_Subtype.egcs_ay_active', '=', true)
      .where('Agency_Funding_Type._deleted', '=', false)
      .where('Agency_Funding_Type.egcs_ay_active', '=', true)
      .whereRef('Agency_Funding_Type.egcs_ay_organizationagency', '=', 'Transfer_Payment_Profile.egcs_tp_agency')
      .select('Transfer_Payment_Stream_Funding_Subtype.egcs_tp_fundingsubtype as id')
      .execute()
    const retained = target.kind === 'forecast'
      ? await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
          .select('egcs_fc_fundingsubtype as id')
          .where('egcs_fc_forecastlineitem', '=', target.lineId)
          .where('egcs_fc_fundingsubtype', 'in', ids)
          .where('_deleted', '=', false).execute()
      : await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
          .select('egcs_fc_fundingsubtype as id')
          .where('egcs_fc_claimlineitem', '=', target.lineId)
          .where('egcs_fc_fundingsubtype', 'in', ids)
          .where('_deleted', '=', false).execute()
    const allowed = new Set([...available, ...retained].map(row => String(row.id)))
    if (ids.some(id => !allowed.has(id))) {
      return await badRequest(event, 'AGREEMENT_FUNDING_SUBTYPE_INVALID', 'apiErrors.agreement.funding_subtype_invalid')
    }
  }

  if (target.kind === 'forecast') {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
      .select(['id', 'egcs_fc_fundingsubtype'])
      .where('egcs_fc_forecastlineitem', '=', target.lineId)
      .where('_deleted', '=', false)
      .execute()
    const desired = new Map(sources.map(source => [source.egcs_fc_fundingsubtype, source]))
    for (const row of existing) {
      const source = desired.get(String(row.egcs_fc_fundingsubtype))
      await trx.updateTable('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .set(source ? { egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount) } : { _deleted: true })
        .where('id', '=', String(row.id))
        .execute()
      if (source) desired.delete(String(row.egcs_fc_fundingsubtype))
    }
    if (desired.size > 0) {
      await trx.insertInto('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .values([...desired.values()].map(source => ({
          egcs_fc_forecastlineitem: target.lineId,
          egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype,
          egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount)
        })))
        .execute()
    }
  } else {
    const existing = await trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
      .select(['id', 'egcs_fc_fundingsubtype'])
      .where('egcs_fc_claimlineitem', '=', target.lineId)
      .where('_deleted', '=', false)
      .execute()
    const desired = new Map(sources.map(source => [source.egcs_fc_fundingsubtype, source]))
    for (const row of existing) {
      const source = desired.get(String(row.egcs_fc_fundingsubtype))
      await trx.updateTable('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .set(source ? { egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount) } : { _deleted: true })
        .where('id', '=', String(row.id))
        .execute()
      if (source) desired.delete(String(row.egcs_fc_fundingsubtype))
    }
    if (desired.size > 0) {
      await trx.insertInto('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .values([...desired.values()].map(source => ({
          egcs_fc_claimlineitem: target.lineId,
          egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype,
          egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount)
        })))
        .execute()
    }
  }
  return null
}

/** Checks the current Stream requirement against every active line in a Forecast or Claim. */
export const getAgreementLineFundingCompletionStatus = async (
  db: Kysely<Database> | Transaction<Database>,
  target: { kind: 'forecast' | 'claim', id: string }
): Promise<{ required: boolean, complete: boolean }> => {
  const header = target.kind === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast')
        .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Forecast.egcs_fc_fundingagreement')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
        .select('Transfer_Payment_Stream.egcs_tp_requireforecastfundingbreakdown as required')
        .where('Funding_Case_Agreement_Forecast.id', '=', target.id)
        .where('Funding_Case_Agreement_Forecast._deleted', '=', false)
        .executeTakeFirst()
    : await db.selectFrom('Funding_Case_Agreement_Claim')
        .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement')
        .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
        .select('Transfer_Payment_Stream.egcs_tp_requireclaimfundingbreakdown as required')
        .where('Funding_Case_Agreement_Claim.id', '=', target.id)
        .where('Funding_Case_Agreement_Claim._deleted', '=', false)
        .executeTakeFirst()
  if (!header?.required) return { required: false, complete: true }

  const lines = target.kind === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
        .select(['id', 'egcs_fc_amount', 'egcs_fc_totalamount'])
        .where('egcs_fc_agreementforecast', '=', target.id)
        .where('_deleted', '=', false)
        .execute()
    : await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
        .select(['id', 'egcs_fc_amount', 'egcs_fc_totalamount'])
        .where('egcs_fc_fundingagreementclaim', '=', target.id)
        .where('_deleted', '=', false)
        .execute()
  if (lines.length === 0) return { required: true, complete: false }
  const ids = lines.map(line => String(line.id))
  const sources = target.kind === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .select(['egcs_fc_forecastlineitem as lineId', 'egcs_fc_amount'])
        .where('egcs_fc_forecastlineitem', 'in', ids)
        .where('_deleted', '=', false)
        .execute()
    : await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .select(['egcs_fc_claimlineitem as lineId', 'egcs_fc_amount'])
        .where('egcs_fc_claimlineitem', 'in', ids)
        .where('_deleted', '=', false)
        .execute()
  const complete = areLineFundingAmountsComplete(
    lines.map(line => ({ id: String(line.id), egcs_fc_amount: line.egcs_fc_amount, egcs_fc_totalamount: line.egcs_fc_totalamount })),
    sources.map(source => ({ lineId: String(source.lineId), egcs_fc_amount: source.egcs_fc_amount })),
    { requireSource: true }
  )
  return { required: true, complete }
}

/** Enforces a saved line's authored funding breakdown without blocking draft imports. */
export const assertAgreementLineFundingBalance = async (
  event: H3Event,
  db: Kysely<Database> | Transaction<Database>,
  target: FundingTarget
) => {
  const line = target.kind === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item')
        .select(['egcs_fc_amount', 'egcs_fc_totalamount'])
        .where('id', '=', target.lineId).executeTakeFirstOrThrow()
    : await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
        .select(['egcs_fc_amount', 'egcs_fc_totalamount'])
        .where('id', '=', target.lineId).executeTakeFirstOrThrow()
  const sources = target.kind === 'forecast'
    ? await db.selectFrom('Funding_Case_Agreement_Forecast_Line_Item_Funding')
        .select('egcs_fc_amount')
        .where('egcs_fc_forecastlineitem', '=', target.lineId).where('_deleted', '=', false).execute()
    : await db.selectFrom('Funding_Case_Agreement_Claim_Line_Item_Funding')
        .select('egcs_fc_amount')
        .where('egcs_fc_claimlineitem', '=', target.lineId).where('_deleted', '=', false).execute()
  if (compareMoney(parseMoney(line.egcs_fc_totalamount), parseMoney(line.egcs_fc_amount)) < 0) {
    return await badRequest(event, 'AGREEMENT_FUNDING_TOTAL_BELOW_PROGRAM', 'apiErrors.agreement.funding_breakdown_required')
  }
  if (sources.length === 0) return null
  if (compareMoney(
    sumMoney([parseMoney(line.egcs_fc_amount), ...sources.map(source => parseMoney(source.egcs_fc_amount))]),
    parseMoney(line.egcs_fc_totalamount)
  ) !== 0) {
    return await badRequest(event, 'AGREEMENT_FUNDING_TOTAL_MISMATCH', 'apiErrors.agreement.funding_breakdown_required')
  }
  return null
}
