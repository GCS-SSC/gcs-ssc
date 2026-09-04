/* eslint-disable jsdoc/require-jsdoc -- Existing helpers use descriptive names and narrow types. */
import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import { badRequest } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import {
  FundingCaseAgreementBudgetFiscalYearPatchSchema,
  FundingCaseAgreementBudgetLineItemCreateSchema
} from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'
import type { AgreementScopeContext } from '~~/server/utils/agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { moneyToCents, type Money } from '~~/shared/utils/money'

type DbClient = Kysely<Database> | Transaction<Database>

const budgetFiscalYearStableText = sql<string>`${budgetFiscalYearStableId}::text`

const routeBadRequest = async (
  event: H3Event,
  code: string,
  key: string
) => {
  const badRequestHandler = (globalThis as { badRequest?: typeof badRequest }).badRequest ?? badRequest
  return await badRequestHandler(event, code, key)
}

export interface AgreementBudgetProgramFundingCapacity {
  agreementBudgetFiscalYearId: string
  fiscalYearId: string
  streamBudgetId: string
  streamBudgetTotal: Money
  overcommitThresholdHundredths: bigint
  allocatedProgramFunding: Money
}

export interface ResolveAgreementBudgetProgramFundingCapacityOptions {
  excludeLineItemId?: string
  lockStreamBudget?: boolean
}

const resolveAgreementBudgetFiscalYear = async (
  db: DbClient,
  agreementBudgetFiscalYearId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
  .innerJoin('Funding_Case_Agreement_Budget_Version', 'Funding_Case_Agreement_Budget_Version.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion')
  .where(budgetFiscalYearStableId, '=', agreementBudgetFiscalYearId)
  .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
  .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
  .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
  .select([
    budgetFiscalYearStableId.as('id'),
    'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear as fiscal_year_id'
  ])
  .executeTakeFirst()

const resolveStreamBudgetForFiscalYear = async (
  db: DbClient,
  streamId: string,
  fiscalYearId: string,
  lockStreamBudget: boolean | undefined
) => {
  let streamBudgetQuery = db
    .selectFrom('Transfer_Payment_Stream_Budget')
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear', '=', fiscalYearId)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)

  if (lockStreamBudget) {
    streamBudgetQuery = streamBudgetQuery.forUpdate()
  }

  return await streamBudgetQuery
    .select([
      'Transfer_Payment_Stream_Budget.id as id',
      databaseMoneyText(sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_totalbudget')).as('total_budget'),
      sql<string>`CAST(${sql.ref('Transfer_Payment_Stream_Budget.egcs_tp_overcommitthreshold')} AS text)`.as('overcommit_threshold')
    ])
    .executeTakeFirst()
}

const resolveAllocatedProgramFunding = async (
  db: DbClient,
  streamId: string,
  fiscalYearId: string,
  excludeLineItemId: string | undefined
) => {
  let allocationQuery = db
    .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.id',
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
    )
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where('Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream', '=', streamId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', '=', fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)

  if (excludeLineItemId) {
    allocationQuery = allocationQuery.where(budgetLineItemStableId, '!=', excludeLineItemId)
  }

  return await allocationQuery
    .select(
      databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')}), 0)`).as(
        'allocated_program_funding'
      )
    )
    .executeTakeFirst()
}

const parseThresholdHundredths = (value: unknown): bigint | null => {
  if (typeof value !== 'string') return null
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value)
  if (!match?.[1]) return null
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0'))
}

export const resolveAgreementBudgetProgramFundingCapacity = async (
  db: DbClient,
  streamId: string,
  agreementBudgetFiscalYearId: string,
  options: ResolveAgreementBudgetProgramFundingCapacityOptions = {}
): Promise<AgreementBudgetProgramFundingCapacity | null> => {
  const fiscalYear = await resolveAgreementBudgetFiscalYear(db, agreementBudgetFiscalYearId)
  if (!fiscalYear) {
    return null
  }

  const streamBudget = await resolveStreamBudgetForFiscalYear(db, streamId, String(fiscalYear.fiscal_year_id), options.lockStreamBudget)
  if (!streamBudget) {
    return null
  }

  const allocation = await resolveAllocatedProgramFunding(db, streamId, String(fiscalYear.fiscal_year_id), options.excludeLineItemId)
  const streamBudgetTotal = parseDatabaseMoney(streamBudget.total_budget)
  const overcommitThresholdHundredths = parseThresholdHundredths(streamBudget.overcommit_threshold)
  const allocatedProgramFunding = parseDatabaseMoney(allocation?.allocated_program_funding)

  if (overcommitThresholdHundredths === null) {
    return null
  }

  return {
    agreementBudgetFiscalYearId: String(fiscalYear.id),
    fiscalYearId: String(fiscalYear.fiscal_year_id),
    streamBudgetId: String(streamBudget.id),
    streamBudgetTotal,
    overcommitThresholdHundredths,
    allocatedProgramFunding
  }
}

export const exceedsAgreementBudgetProgramFundingCapacity = (
  capacity: AgreementBudgetProgramFundingCapacity,
  nextProgramFunding: Money
) => {
  const requestedCents = moneyToCents(capacity.allocatedProgramFunding) + moneyToCents(nextProgramFunding)
  const maximumScaledCents = moneyToCents(capacity.streamBudgetTotal)
    * (BigInt(100) + capacity.overcommitThresholdHundredths)
  return requestedCents * BigInt(100) > maximumScaledCents
}

export const assertAgreementBudgetProgramFundingCapacity = async (
  event: H3Event,
  db: DbClient,
  streamId: string,
  agreementBudgetFiscalYearId: string,
  targetProgramFunding: Money,
  options: ResolveAgreementBudgetProgramFundingCapacityOptions = {}
) => {
  const capacity = await resolveAgreementBudgetProgramFundingCapacity(
    db,
    streamId,
    agreementBudgetFiscalYearId,
    options
  )

  if (!capacity) {
    return await badRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
  }

  if (exceedsAgreementBudgetProgramFundingCapacity(capacity, targetProgramFunding)) {
    return await badRequest(
      event,
      'AGREEMENT_BUDGET_PROGRAM_FUNDING_EXCEEDS_STREAM_BUDGET',
      'apiErrors.agreement.program_funding_exceeds_stream_budget'
    )
  }

  return null
}

const fetchBudgetFiscalYearDisplay = async (
  db: DbClient,
  fiscalYearId: string
) => await db
  .selectFrom('Agency_Fiscal_Year')
  .where('Agency_Fiscal_Year.id', '=', fiscalYearId)
  .where('Agency_Fiscal_Year._deleted', '=', false)
  .select('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display')
  .executeTakeFirst()

const fetchStreamBudgetFiscalYear = async (
  db: DbClient,
  streamId: string,
  fiscalYearId: string
) => await db
  .selectFrom('Transfer_Payment_Stream_Budget')
  .innerJoin(
    'Transfer_Payment_Fiscal_Year_Budget',
    'Transfer_Payment_Fiscal_Year_Budget.id',
    'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
  )
  .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear')
  .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
  .where(sql<string>`"Transfer_Payment_Fiscal_Year_Budget"."egcs_tp_fiscalyear"::text`, '=', fiscalYearId)
  .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
  .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
  .where('Agency_Fiscal_Year._deleted', '=', false)
  .select(['Agency_Fiscal_Year.id as id', 'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display'])
  .executeTakeFirst()

export const patchAgreementBudgetFiscalYear = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  childId: string,
  streamId: string
) => {
  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const existing = await assertAgreementChildExists(
    event,
    db
      .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin(
        'Funding_Case_Agreement_Budget_Version',
        'Funding_Case_Agreement_Budget_Version.id',
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
      )
      .where(budgetFiscalYearStableText, '=', childId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Budget_Fiscal_Year.id as version_row_id',
        budgetFiscalYearStableId.as('id'),
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear as egcs_fc_fiscalyear'
      ])
      .executeTakeFirst(),
    ...AGREEMENT_CHILD_ERROR_KEYS.budgetFiscalYearNotFound
  )
  if (!existing || typeof existing !== 'object' || !('id' in existing)) {
    return existing
  }

  const readBody = (globalThis as { readValidatedBodyI18n?: typeof readValidatedBodyI18n }).readValidatedBodyI18n ?? readValidatedBodyI18n
  const validated = await readBody(event, FundingCaseAgreementBudgetFiscalYearPatchSchema)
  if (!Object.hasOwn(validated, 'egcs_fc_fiscalyear')) {
    const fiscalYear = await fetchBudgetFiscalYearDisplay(db, existing.egcs_fc_fiscalyear)
    return {
      id: existing.id,
      egcs_fc_fiscalyear: existing.egcs_fc_fiscalyear,
      fiscal_year_display: fiscalYear?.fiscal_year_display ?? null
    }
  }

  if (String(validated.egcs_fc_fiscalyear) !== String(existing.egcs_fc_fiscalyear)) {
    const activeLine = await db
      .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
      .select('id')
      .where('egcs_fc_fundingagreementbudgetfiscalyear', '=', String(existing.version_row_id))
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (activeLine) {
      return await routeBadRequest(event, 'AGREEMENT_BUDGET_FISCAL_YEAR_IN_USE', 'apiErrors.request.invalid_status')
    }
  }

  const fiscalYear = await fetchStreamBudgetFiscalYear(db, streamId, validated.egcs_fc_fiscalyear as string)
  if (!fiscalYear) {
    return await routeBadRequest(event, 'INVALID_AGREEMENT_BUDGET_FISCAL_YEAR', 'apiErrors.agreement.invalid_budget_fiscal_year')
  }

  try {
    const updated = await db
      .updateTable('Funding_Case_Agreement_Budget_Fiscal_Year')
      .set({ egcs_fc_fiscalyear: validated.egcs_fc_fiscalyear })
      .where('id', '=', String(existing.version_row_id))
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returning(['id', 'egcs_fc_originalbudgetfiscalyear', 'egcs_fc_fiscalyear'])
      .executeTakeFirstOrThrow()

    return {
      ...updated,
      id: updated.egcs_fc_originalbudgetfiscalyear ?? updated.id,
      fiscal_year_display: fiscalYear.fiscal_year_display
    }
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

const assertAgreementBudgetFiscalYearForAgreement = async (
  event: H3Event,
  db: Transaction<Database>,
  agreementId: string,
  fiscalYearIdentityId: string
) => {
  const fiscalYear = await assertAgreementChildExists(
    event,
    db
      .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
      .innerJoin(
        'Funding_Case_Agreement_Budget_Version',
        'Funding_Case_Agreement_Budget_Version.id',
        'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
      )
      .where(budgetFiscalYearStableText, '=', fiscalYearIdentityId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .select('Funding_Case_Agreement_Budget_Fiscal_Year.id as id')
      .forUpdate('Funding_Case_Agreement_Budget_Fiscal_Year')
      .executeTakeFirst(),
    ...AGREEMENT_CHILD_ERROR_KEYS.budgetFiscalYearNotFound
  )

  return fiscalYear
}

const fetchAgreementBudgetCostCategory = async (
  db: DbClient,
  streamId: string,
  costCategoryId: string
) => {
  return await db.selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .innerJoin(
      'Agency_Cost_Category_Line_Item',
      'Agency_Cost_Category_Line_Item.id',
      'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
    )
    .where(sql<string>`"Transfer_Payment_Stream_Cost_Category_Line_Item"."id"::text`, '=', costCategoryId)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
    .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
    .select([
      'Transfer_Payment_Stream_Cost_Category_Line_Item.id as id',
      'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
      'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
    ])
    .forUpdate('Transfer_Payment_Stream_Cost_Category_Line_Item')
    .executeTakeFirst()
}

const fetchAgreementBudgetLineFiscalYearLabel = async (
  db: DbClient,
  fiscalYearRowId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
  .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
  .where('Funding_Case_Agreement_Budget_Fiscal_Year.id', '=', fiscalYearRowId)
  .select('Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display')
  .executeTakeFirst()

export const createAgreementBudgetLineItem = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext
) => {
  const readBody = (globalThis as { readValidatedBodyI18n?: typeof readValidatedBodyI18n }).readValidatedBodyI18n ?? readValidatedBodyI18n
  const validated = await readBody(event, FundingCaseAgreementBudgetLineItemCreateSchema)

  return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, initialContext, async (trx, currentContext) => {
    const fiscalYear = await assertAgreementBudgetFiscalYearForAgreement(
      event,
      trx,
      agreementId,
      validated.egcs_fc_fundingagreementbudgetfiscalyear
    )
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return fiscalYear
    }

    const costCategory = await fetchAgreementBudgetCostCategory(
      trx,
      currentContext.streamId,
      validated.egcs_fc_organizationcostcategory
    )
    if (!costCategory) {
      return await routeBadRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item')
    }

    const capacityGuard = await assertAgreementBudgetProgramFundingCapacity(
      event,
      trx,
      currentContext.streamId,
      validated.egcs_fc_fundingagreementbudgetfiscalyear,
      validated.egcs_fc_programfunding,
      { lockStreamBudget: true }
    )

    if (capacityGuard) {
      return capacityGuard
    }

    const inserted = await trx
      .insertInto('Funding_Case_Agreement_Budget_Line_Item')
      .values({
        ...validated,
        egcs_fc_totalamount: databaseMoneyValue(validated.egcs_fc_totalamount),
        egcs_fc_programfunding: databaseMoneyValue(validated.egcs_fc_programfunding),
        egcs_fc_otherfederalfunding: validated.egcs_fc_otherfederalfunding === undefined
          ? undefined
          : databaseMoneyValue(validated.egcs_fc_otherfederalfunding),
        egcs_fc_othergovfunding: validated.egcs_fc_othergovfunding === undefined
          ? undefined
          : databaseMoneyValue(validated.egcs_fc_othergovfunding),
        egcs_fc_otherfunding: validated.egcs_fc_otherfunding === undefined
          ? undefined
          : databaseMoneyValue(validated.egcs_fc_otherfunding),
        egcs_fc_fundingagreement: agreementId,
        egcs_fc_fundingagreementbudgetfiscalyear: String(fiscalYear.id)
      })
      .returning([
        'id', 'egcs_fc_originalbudgetlineitem', 'egcs_fc_fundingagreementbudgetfiscalyear',
        'egcs_fc_organizationcostcategory', 'egcs_fc_costsubsection', 'egcs_fc_description',
        databaseMoneyText(sql.ref('egcs_fc_totalamount')).as('egcs_fc_totalamount'),
        databaseMoneyText(sql.ref('egcs_fc_programfunding')).as('egcs_fc_programfunding'),
        databaseMoneyText(sql.ref('egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
        databaseMoneyText(sql.ref('egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
        databaseMoneyText(sql.ref('egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
        'egcs_fc_currency'
      ])
      .executeTakeFirstOrThrow()

    const fiscalYearLabel = await fetchAgreementBudgetLineFiscalYearLabel(
      trx,
      inserted.egcs_fc_fundingagreementbudgetfiscalyear
    )

    return {
      ...inserted,
      egcs_fc_totalamount: parseDatabaseMoney(inserted.egcs_fc_totalamount),
      egcs_fc_programfunding: parseDatabaseMoney(inserted.egcs_fc_programfunding),
      egcs_fc_otherfederalfunding: inserted.egcs_fc_otherfederalfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_otherfederalfunding),
      egcs_fc_othergovfunding: inserted.egcs_fc_othergovfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_othergovfunding),
      egcs_fc_otherfunding: inserted.egcs_fc_otherfunding === null ? null : parseDatabaseMoney(inserted.egcs_fc_otherfunding),
      id: inserted.egcs_fc_originalbudgetlineitem ?? inserted.id,
      egcs_fc_fundingagreementbudgetfiscalyear: validated.egcs_fc_fundingagreementbudgetfiscalyear,
      fiscal_year_id: validated.egcs_fc_fundingagreementbudgetfiscalyear,
      fiscal_year_display: fiscalYearLabel?.fiscal_year_display ?? null,
      line_item_name_en: costCategory.line_item_name_en,
      line_item_name_fr: costCategory.line_item_name_fr
    }
  }, { action: 'create', blocksApprovalSubmission: true })
}
