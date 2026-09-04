/* eslint-disable jsdoc/require-jsdoc -- Budget line-item route behavior is covered by focused route tests. */
import type { H3Event } from 'h3'
import { authorize } from '~~/server/utils/authorize'
import { badRequest } from '~~/server/utils/api-errors'
import { FundingCaseAgreementBudgetLineItemPatchSchema, type FundingCaseAgreementBudgetLineItemPatch } from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'
import { canAccessAgreement, resolveAgreementScopeContext } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import {
  assertAgreementBudgetProgramFundingCapacity
} from '~~/server/utils/agreement-budget'
import { sql, type Kysely, type Transaction } from 'kysely'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { validateMergedBudgetLineItemFundingPatch } from '~~/server/utils/agreement-financial-patch-validation'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import type { Money } from '~~/shared/utils/money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type AgreementBudgetLineDb = Kysely<Database> | Transaction<Database>

const getBudgetLinePatchRouteParams = async (event: H3Event): Promise<{
  agreementId: string
  childId: string
} | {
  response: unknown
}> => {
  const agreementId = getRouterParam(event, 'id')
  const childId = getRouterParam(event, 'childId')

  if (!agreementId || !childId) {
    return { response: await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id') }
  }
  if (!isPositivePostgresBigintText(childId)) {
    return { response: await badRequest(event, 'AGREEMENT_BUDGET_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.budget_line_item_not_found') }
  }

  return { agreementId, childId }
}

const resolveBudgetLinePatchAgreementContext = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string
) => {
  const agreementContext = await resolveAgreementScopeContext(agreementId, db)
  if (!agreementContext) {
    return { response: await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found') }
  }

  await authorize(event, 'agreement', 'update', async ({ context }) => {
    const canUpdate = await canAccessAgreement(context, 'update', agreementContext.scope, db)
    if (canUpdate) return { bypass: true }
    return { denied: true }
  })

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return { response: agreement }
  }

  return { agreementContext }
}

const getExistingBudgetLineItem = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  agreementId: string,
  childId: string
) => await assertAgreementChildExists(
  event,
  db
    .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.id',
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where(sql<string>`${budgetLineItemStableId}::text`, '=', childId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Budget_Line_Item.id as id',
      budgetLineItemStableId.as('egcs_fc_budgetlineitemidentity'),
      'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear as egcs_fc_fundingagreementbudgetfiscalyear',
      budgetFiscalYearStableId.as('egcs_fc_budgetfiscalyearidentity'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding')
    ])
    .forUpdate('Funding_Case_Agreement_Budget_Line_Item')
    .executeTakeFirst(),
  ...AGREEMENT_CHILD_ERROR_KEYS.budgetLineItemNotFound
)

const assertBudgetLinePatchReferences = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  agreementId: string,
  streamId: string,
  patchValues: FundingCaseAgreementBudgetLineItemPatch
) => {
  let fiscalYearRowId: string | undefined
  if (Object.hasOwn(patchValues, 'egcs_fc_fundingagreementbudgetfiscalyear')) {
    const fiscalYear = await assertAgreementChildExists(
      event,
      db
        .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
        .innerJoin(
          'Funding_Case_Agreement_Budget_Version',
          'Funding_Case_Agreement_Budget_Version.id',
          'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
        )
        .where(sql<string>`${budgetFiscalYearStableId}::text`, '=', patchValues.egcs_fc_fundingagreementbudgetfiscalyear as string)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
        .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
        .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
        .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
        .select('Funding_Case_Agreement_Budget_Fiscal_Year.id as id')
        .executeTakeFirst(),
      ...AGREEMENT_CHILD_ERROR_KEYS.budgetFiscalYearNotFound
    )
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return { response: fiscalYear }
    }
    fiscalYearRowId = String(fiscalYear.id)
  }

  if (Object.hasOwn(patchValues, 'egcs_fc_organizationcostcategory')) {
    const costCategory = await db
      .selectFrom('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .innerJoin(
        'Agency_Cost_Category_Line_Item',
        'Agency_Cost_Category_Line_Item.id',
        'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
      )
      .where(sql<string>`"Transfer_Payment_Stream_Cost_Category_Line_Item"."id"::text`, '=', patchValues.egcs_fc_organizationcostcategory as string)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_transferpaymentstream', '=', streamId)
      .where('Transfer_Payment_Stream_Cost_Category_Line_Item._deleted', '=', false)
      .where('Agency_Cost_Category_Line_Item._deleted', '=', false)
      .select('Transfer_Payment_Stream_Cost_Category_Line_Item.id')
      .forUpdate('Transfer_Payment_Stream_Cost_Category_Line_Item')
      .executeTakeFirst()

    if (!costCategory) {
      return { response: await badRequest(event, 'INVALID_AGREEMENT_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_cost_category_line_item') }
    }
  }

  return { fiscalYearRowId }
}

const updateBudgetLineItemWithCapacityCheck = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  streamId: string,
  childRowId: string,
  lineItemIdentityId: string,
  patchValues: FundingCaseAgreementBudgetLineItemPatch,
  targetAgreementBudgetFiscalYearId: string,
  targetProgramFunding: Money
) => {
  const capacityGuard = await assertAgreementBudgetProgramFundingCapacity(
    event,
    db,
    streamId,
    targetAgreementBudgetFiscalYearId,
    targetProgramFunding,
    {
      excludeLineItemId: lineItemIdentityId,
      lockStreamBudget: true
    }
  )

  if (capacityGuard) {
    return capacityGuard
  }

  const {
    egcs_fc_totalamount,
    egcs_fc_programfunding,
    egcs_fc_otherfederalfunding,
    egcs_fc_othergovfunding,
    egcs_fc_otherfunding,
    ...nonMoneyPatchValues
  } = patchValues
  return await db
    .updateTable('Funding_Case_Agreement_Budget_Line_Item')
    .set({
      ...nonMoneyPatchValues,
      ...(egcs_fc_totalamount === undefined ? {} : { egcs_fc_totalamount: databaseMoneyValue(egcs_fc_totalamount) }),
      ...(egcs_fc_programfunding === undefined ? {} : { egcs_fc_programfunding: databaseMoneyValue(egcs_fc_programfunding) }),
      ...(egcs_fc_otherfederalfunding === undefined ? {} : { egcs_fc_otherfederalfunding: databaseMoneyValue(egcs_fc_otherfederalfunding) }),
      ...(egcs_fc_othergovfunding === undefined ? {} : { egcs_fc_othergovfunding: databaseMoneyValue(egcs_fc_othergovfunding) }),
      ...(egcs_fc_otherfunding === undefined ? {} : { egcs_fc_otherfunding: databaseMoneyValue(egcs_fc_otherfunding) })
    })
    .where('id', '=', childRowId)
    .where('_deleted', '=', false)
    .returning('id')
    .executeTakeFirstOrThrow()
}

const fetchBudgetLineItemResponse = async (
  db: AgreementBudgetLineDb,
  lineItemId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Budget_Line_Item')
  .innerJoin(
    'Funding_Case_Agreement_Budget_Fiscal_Year',
    'Funding_Case_Agreement_Budget_Fiscal_Year.id',
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
  )
  .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
  .innerJoin(
    'Transfer_Payment_Stream_Cost_Category_Line_Item',
    'Transfer_Payment_Stream_Cost_Category_Line_Item.id',
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory'
  )
  .innerJoin(
    'Agency_Cost_Category_Line_Item',
    'Agency_Cost_Category_Line_Item.id',
    'Transfer_Payment_Stream_Cost_Category_Line_Item.egcs_tp_organizationcostcategory'
  )
  .where('Funding_Case_Agreement_Budget_Line_Item.id', '=', lineItemId)
  .select([
    budgetLineItemStableId.as('id'),
    budgetFiscalYearStableId.as('egcs_fc_fundingagreementbudgetfiscalyear'),
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory as egcs_fc_organizationcostcategory',
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_costsubsection as egcs_fc_costsubsection',
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_description as egcs_fc_description',
    databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_totalamount')).as('egcs_fc_totalamount'),
    databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')).as('egcs_fc_programfunding'),
    databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfederalfunding')).as('egcs_fc_otherfederalfunding'),
    databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_othergovfunding')).as('egcs_fc_othergovfunding'),
    databaseMoneyText(sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_otherfunding')).as('egcs_fc_otherfunding'),
    'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_currency as egcs_fc_currency',
    budgetFiscalYearStableId.as('fiscal_year_id'),
    'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year_display',
    'Agency_Cost_Category_Line_Item.egcs_ay_name_en as line_item_name_en',
    'Agency_Cost_Category_Line_Item.egcs_ay_name_fr as line_item_name_fr'
  ])
  .executeTakeFirstOrThrow()
  .then(line => ({
    ...line,
    egcs_fc_totalamount: parseDatabaseMoney(line.egcs_fc_totalamount),
    egcs_fc_programfunding: parseDatabaseMoney(line.egcs_fc_programfunding),
    egcs_fc_otherfederalfunding: line.egcs_fc_otherfederalfunding === null ? null : parseDatabaseMoney(line.egcs_fc_otherfederalfunding),
    egcs_fc_othergovfunding: line.egcs_fc_othergovfunding === null ? null : parseDatabaseMoney(line.egcs_fc_othergovfunding),
    egcs_fc_otherfunding: line.egcs_fc_otherfunding === null ? null : parseDatabaseMoney(line.egcs_fc_otherfunding)
  }))

const isEntityResponse = (value: unknown): value is { id: string | number } =>
  value !== null && typeof value === 'object' && 'id' in value

const assertClaimLinkedBudgetLineCanMove = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  existing: {
    egcs_fc_budgetlineitemidentity: string
    egcs_fc_fundingagreementbudgetfiscalyear: string | number
    egcs_fc_budgetfiscalyearidentity: string | number
  },
  patchValues: FundingCaseAgreementBudgetLineItemPatch
) => {
  if (
    !Object.hasOwn(patchValues, 'egcs_fc_fundingagreementbudgetfiscalyear')
    || String(patchValues.egcs_fc_fundingagreementbudgetfiscalyear) === String(existing.egcs_fc_budgetfiscalyearidentity)
  ) {
    return null
  }

  const activeClaimLine = await db
    .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim'
    )
    .where(
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem',
      '=',
      String(existing.egcs_fc_budgetlineitemidentity)
    )
    .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .select('Funding_Case_Agreement_Claim_Line_Item.id')
    .executeTakeFirst()

  return activeClaimLine
    ? await badRequest(
        event,
        'AGREEMENT_BUDGET_LINE_ITEM_CLAIM_MOVE_NOT_ALLOWED',
        'apiErrors.agreement.budget_line_item_claim_move_not_allowed'
      )
    : null
}

const getBudgetLinePatchTargetValues = (
  patchValues: FundingCaseAgreementBudgetLineItemPatch,
  existing: {
    egcs_fc_fundingagreementbudgetfiscalyear: string | number
    egcs_fc_programfunding: string
  }
) => ({
  targetAgreementBudgetFiscalYearId: String(
    patchValues.egcs_fc_fundingagreementbudgetfiscalyear ?? existing.egcs_fc_fundingagreementbudgetfiscalyear
  ),
  targetProgramFunding: patchValues.egcs_fc_programfunding ?? parseDatabaseMoney(existing.egcs_fc_programfunding)
})

const resolveBudgetLinePatchInput = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  agreementId: string,
  childId: string,
  streamId: string
) => {
  const existing = await getExistingBudgetLineItem(event, db, agreementId, childId)
  if (!isEntityResponse(existing)) {
    return { response: existing }
  }

  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementBudgetLineItemPatchSchema)
  await validateMergedBudgetLineItemFundingPatch(event, existing, patchValues)
  const referenceGuard = await assertBudgetLinePatchReferences(event, db, agreementId, streamId, patchValues)
  if ('response' in referenceGuard) {
    return { response: referenceGuard.response }
  }

  const claimMoveGuard = await assertClaimLinkedBudgetLineCanMove(event, db, existing, patchValues)
  if (claimMoveGuard) {
    return { response: claimMoveGuard }
  }

  const persistedPatchValues: FundingCaseAgreementBudgetLineItemPatch = { ...patchValues }
  if (Object.hasOwn(patchValues, 'egcs_fc_fundingagreementbudgetfiscalyear') && referenceGuard.fiscalYearRowId) {
    persistedPatchValues.egcs_fc_fundingagreementbudgetfiscalyear = referenceGuard.fiscalYearRowId
  }

  return {
    childRowId: String(existing.id),
    lineItemIdentityId: String(existing.egcs_fc_budgetlineitemidentity),
    patchValues: persistedPatchValues,
    ...getBudgetLinePatchTargetValues(patchValues, {
      ...existing,
      egcs_fc_fundingagreementbudgetfiscalyear: existing.egcs_fc_budgetfiscalyearidentity
    })
  }
}

const applyBudgetLinePatch = async (
  event: H3Event,
  db: AgreementBudgetLineDb,
  streamId: string,
  input: {
    childRowId: string
    lineItemIdentityId: string
    patchValues: FundingCaseAgreementBudgetLineItemPatch
    targetAgreementBudgetFiscalYearId: string
    targetProgramFunding: Money
  }
) => {
  const updated = await updateBudgetLineItemWithCapacityCheck(
    event,
    db,
    streamId,
    input.childRowId,
    input.lineItemIdentityId,
    input.patchValues,
    input.targetAgreementBudgetFiscalYearId,
    input.targetProgramFunding
  )

  return isEntityResponse(updated)
    ? await fetchBudgetLineItemResponse(db, String(updated.id))
    : updated
}

export default defineEventHandler(async event => {
  const db = event.context.$db as Kysely<Database>
  const params = await getBudgetLinePatchRouteParams(event)
  if ('response' in params) {
    return params.response
  }
  const { agreementId, childId } = params

  const prepared = await resolveBudgetLinePatchAgreementContext(event, db, agreementId)
  if ('response' in prepared) {
    return prepared.response
  }
  const { agreementContext } = prepared
  try {
    return await executeFreshAuthorizedAgreementWrite(
      event,
      db,
      agreementId,
      agreementContext,
      async (trx, currentContext) => {
        const input = await resolveBudgetLinePatchInput(event, trx, agreementId, childId, currentContext.streamId)
        if ('response' in input) {
          return input.response
        }

        return await applyBudgetLinePatch(event, trx, currentContext.streamId, input)
      },
      { action: 'update', blocksApprovalSubmission: true }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
  }
})
