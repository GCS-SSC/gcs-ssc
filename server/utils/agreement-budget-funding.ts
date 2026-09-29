import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { FundingCaseAgreementFundingSource } from '~~/shared/types/schemas/funding-case-agreement'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { badRequest } from './api-errors'
import { sql } from 'kysely'

type Db = Kysely<Database> | Transaction<Database>

/**
 * Loads display metadata and amounts for saved Budget funding allocations.
 * @param db - Database connection.
 * @param lineIds - Physical Budget line IDs.
 * @returns Saved allocations with bilingual labels and type flags.
 */
export const loadBudgetFundingSources = async (db: Db, lineIds: string[]) => {
  if (lineIds.length === 0) return []
  const rows = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item_Funding as funding')
    .innerJoin('Agency_Funding_Subtype as subtype', 'subtype.id', 'funding.egcs_fc_fundingsubtype')
    .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
    .select([
      'funding.id', 'funding.egcs_fc_budgetlineitem', 'funding.egcs_fc_fundingsubtype',
      databaseMoneyText(sql.ref('funding.egcs_fc_amount')).as('egcs_fc_amount'),
      'funding.egcs_fc_description_en', 'funding.egcs_fc_description_fr',
      'subtype.egcs_ay_name_en as funding_subtype_name_en',
      'subtype.egcs_ay_name_fr as funding_subtype_name_fr',
      'type.egcs_ay_name_en as funding_type_name_en',
      'type.egcs_ay_name_fr as funding_type_name_fr',
      'type.egcs_ay_instacking as funding_type_instacking',
      'type.egcs_ay_incostsharing as funding_type_incostsharing'
    ])
    .where('funding.egcs_fc_budgetlineitem', 'in', lineIds)
    .where('funding._deleted', '=', false)
    .orderBy('type.egcs_ay_name_en').orderBy('subtype.egcs_ay_name_en').orderBy('funding.id')
    .execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) }))
}

/**
 * Groups saved allocations by physical Budget line identity.
 * @param sources - Saved allocations.
 * @returns Allocations keyed by Budget line ID.
 */
export const budgetFundingSourcesByLine = <T extends { egcs_fc_budgetlineitem: string }>(sources: T[]) => {
  const byLine = new Map<string, T[]>()
  for (const source of sources) {
    const key = String(source.egcs_fc_budgetlineitem)
    const items = byLine.get(key) ?? []
    items.push(source)
    byLine.set(key, items)
  }
  return byLine
}

/**
 * Verifies each selected subtype is available to the Stream or retained on this line.
 * @param event - Current request event.
 * @param db - Database connection.
 * @param streamId - Owning Stream ID.
 * @param sources - Proposed allocations.
 * @param retainedLineId - Physical Budget line ID for an existing edit.
 * @returns Nothing after successful validation.
 */
export const validateBudgetFundingSources = async (
  event: H3Event,
  db: Db,
  streamId: string,
  sources: FundingCaseAgreementFundingSource[],
  retainedLineId?: string
) => {
  const ids = sources.map(source => source.egcs_fc_fundingsubtype)
  if (new Set(ids).size !== ids.length) {
    return await badRequest(event, 'DUPLICATE_BUDGET_FUNDING_SUBTYPE', 'apiErrors.agreement.duplicate_funding_subtype')
  }
  if (ids.length === 0) return
  const [available, retained] = await Promise.all([
    db.selectFrom('Transfer_Payment_Stream_Funding_Subtype as link')
      .innerJoin('Agency_Funding_Subtype as subtype', 'subtype.id', 'link.egcs_tp_fundingsubtype')
      .innerJoin('Agency_Funding_Type as type', 'type.id', 'subtype.egcs_ay_fundingtype')
      .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'link.egcs_tp_transferpaymentstream')
      .innerJoin('Transfer_Payment_Profile as profile', 'profile.id', 'stream.egcs_tp_transferpaymentprofile')
      .select('subtype.id')
      .where('link.egcs_tp_transferpaymentstream', '=', streamId)
      .where('subtype.id', 'in', ids)
      .whereRef('type.egcs_ay_organizationagency', '=', 'profile.egcs_tp_agency')
      .where('link._deleted', '=', false).where('subtype._deleted', '=', false)
      .where('type._deleted', '=', false).where('subtype.egcs_ay_active', '=', true)
      .where('type.egcs_ay_active', '=', true).execute(),
    retainedLineId
      ? db.selectFrom('Funding_Case_Agreement_Budget_Line_Item_Funding')
          .select('egcs_fc_fundingsubtype')
          .where('egcs_fc_budgetlineitem', '=', retainedLineId)
          .where('egcs_fc_fundingsubtype', 'in', ids)
          .where('_deleted', '=', false).execute()
      : Promise.resolve([])
  ])
  const allowed = new Set([
    ...available.map(item => String(item.id)),
    ...retained.map(item => String(item.egcs_fc_fundingsubtype))
  ])
  if (ids.some(id => !allowed.has(String(id)))) {
    return await badRequest(event, 'INVALID_BUDGET_FUNDING_SUBTYPE', 'apiErrors.agreement.invalid_funding_subtype')
  }
}

/**
 * Replaces allocations inside the caller's authorized write transaction.
 * @param db - Write transaction.
 * @param lineId - Physical Budget line ID.
 * @param sources - Complete replacement allocations.
 */
export const replaceBudgetFundingSources = async (
  db: Db,
  lineId: string,
  sources: FundingCaseAgreementFundingSource[]
) => {
  const existing = await db.selectFrom('Funding_Case_Agreement_Budget_Line_Item_Funding')
    .select(['id', 'egcs_fc_fundingsubtype'])
    .where('egcs_fc_budgetlineitem', '=', lineId)
    .where('_deleted', '=', false)
    .execute()
  const desired = new Map(sources.map(source => [String(source.egcs_fc_fundingsubtype), source]))
  const retained = new Set<string>()

  for (const row of existing) {
    const subtypeId = String(row.egcs_fc_fundingsubtype)
    const source = desired.get(subtypeId)
    if (!source) {
      await db.updateTable('Funding_Case_Agreement_Budget_Line_Item_Funding')
        .set({ _deleted: true })
        .where('id', '=', row.id)
        .where('egcs_fc_budgetlineitem', '=', lineId)
        .where('_deleted', '=', false)
        .execute()
      continue
    }
    retained.add(subtypeId)
    await db.updateTable('Funding_Case_Agreement_Budget_Line_Item_Funding')
      .set({
        egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount),
        egcs_fc_description_en: source.egcs_fc_description_en ?? null,
        egcs_fc_description_fr: source.egcs_fc_description_fr ?? null
      })
      .where('id', '=', row.id)
      .where('egcs_fc_budgetlineitem', '=', lineId)
      .where('_deleted', '=', false)
      .execute()
  }

  const additions = sources.filter(source => !retained.has(String(source.egcs_fc_fundingsubtype)))
  if (additions.length === 0) return
  await db.insertInto('Funding_Case_Agreement_Budget_Line_Item_Funding').values(additions.map(source => ({
    egcs_fc_budgetlineitem: lineId,
    egcs_fc_fundingsubtype: source.egcs_fc_fundingsubtype,
    egcs_fc_amount: databaseMoneyValue(source.egcs_fc_amount),
    egcs_fc_description_en: source.egcs_fc_description_en ?? null,
    egcs_fc_description_fr: source.egcs_fc_description_fr ?? null,
    _deleted: false
  }))).execute()
}
