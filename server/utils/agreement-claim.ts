/* eslint-disable jsdoc/require-jsdoc -- Existing exported claim helpers are intentionally documented by their descriptive names. */
import { getRouterParam, type H3Event } from 'h3'
import { sql, type Insertable, type Kysely, type Selectable, type Transaction } from 'kysely'
import type {
  GcsExtensionAgreementClaimCreateInput,
  GcsExtensionAgreementClaimCreateResult
} from '@gcs-ssc/extensions/server'
import { badRequest, forbidden, unauthorized } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource, type AgreementScopeContext } from '~~/server/utils/agreement'
import {
  lockAgreementAggregate,
  lockAgreementAggregates,
  type AgreementAggregateLock
} from '~~/server/utils/agreement-aggregate-lock'
import { assertAgreementExists } from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import {
  FundingCaseAgreementClaimPatchSchema,
  FundingCaseAgreementClaimLineItemPatchSchema,
  FundingCaseAgreementClaimReconcilePatchSchema,
  FundingCaseAgreementClaimReconcileLineItemPatchSchema
} from '~~/shared/types/schemas'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { hasPositiveCompletionTerminus } from '~~/server/utils/completion-terminus'
import type {
  FundingCaseAgreementClaimLineItemPatch,
  FundingCaseAgreementClaimReconcilePatch,
  FundingCaseAgreementClaimReconcileLineItemBulkSave,
  FundingCaseAgreementClaimReconcileLineItemPatch
} from '~~/shared/types/schemas/funding-case-agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { budgetFiscalYearStableId, budgetLineItemStableId } from '~~/server/utils/agreement-budget-lineage'
import { hasApprovedTargetEvidence } from '~~/server/utils/business-approval-evidence'
import { validateMergedFinancialPeriodPatch } from '~~/server/utils/agreement-financial-patch-validation'
import { resolveCurrentCommonUser } from '~~/server/utils/additional-reviewer-runtime'
import {
  assertBusinessStatusMutationAllowed,
  BusinessStatusViolation,
  lockAgencyDraftStatus
} from '~~/server/utils/business-status-runtime'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { createPrimaryEntityAssignment } from '~~/server/utils/entity-assignment'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { parseMoney } from '~~/shared/utils/money'

type AgreementClaimDb = Kysely<Database> | Transaction<Database>

type CreatedAgreementClaimResult = Extract<GcsExtensionAgreementClaimCreateResult, { status: 'created' }> & {
  claim: Selectable<Database['Funding_Case_Agreement_Claim']>
}

export type AgreementClaimAggregateCreateResult =
  | CreatedAgreementClaimResult
  | Exclude<GcsExtensionAgreementClaimCreateResult, { status: 'created' }>

/**
 * Creates a Claim, all supplied lines, and its creator assignment atomically.
 *
 * @param trx - Existing transaction that already holds fresh Agreement authorization and locks.
 * @param input - Host SDK Claim aggregate input.
 * @param agencyId - Freshly resolved owning Agency.
 * @param creatorId - Active Common User identity for the authenticated actor.
 * @returns Created identities or the stable unavailable result detected under lock.
 */
export const createAgreementClaimAggregate = async (
  trx: Transaction<Database>,
  input: GcsExtensionAgreementClaimCreateInput,
  agencyId: string,
  creatorId: string
): Promise<AgreementClaimAggregateCreateResult> => {
  const fiscalYear = await trx
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .select(budgetFiscalYearStableId.as('id'))
    .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', input.agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!fiscalYear) return { status: 'fiscal_year_unavailable' }

  let draftStatusId: string
  try {
    draftStatusId = await lockAgencyDraftStatus(trx, agencyId)
  } catch (error: unknown) {
    if (error instanceof BusinessStatusViolation && error.code === 'BUSINESS_STATUS_NOT_FOUND') {
      return { status: 'requested_status_unavailable' }
    }
    throw error
  }
  if (input.expectedDraftStatusId !== undefined && input.expectedDraftStatusId !== draftStatusId) {
    const requestedStatus = await trx.selectFrom('Common_Status')
      .select('egcs_cn_isdraft')
      .where('id', '=', input.expectedDraftStatusId)
      .where('egcs_cn_agency', '=', agencyId)
      .where('_deleted', '=', false)
      .forUpdate()
      .executeTakeFirst()
    if (requestedStatus && !requestedStatus.egcs_cn_isdraft) {
      return { status: 'requested_status_not_draft' }
    }
    return { status: 'requested_status_unavailable' }
  }

  const budgetLineItemIds = [...new Set(input.lineItems.flatMap(line => line.budgetLineItemId ? [line.budgetLineItemId] : []))]
  if (budgetLineItemIds.length > 0) {
    const availableLines = await trx
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
      .select(budgetLineItemStableId.as('id'))
      .where(budgetLineItemStableId, 'in', budgetLineItemIds)
      .where(budgetFiscalYearStableId, '=', input.fiscalYearId)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', input.agreementId)
      .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
      .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
      .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
      .forUpdate()
      .execute()
    if (new Set(availableLines.map(line => String(line.id))).size !== budgetLineItemIds.length) {
      return { status: 'fiscal_year_unavailable' }
    }
  }

  const claim = await trx.insertInto('Funding_Case_Agreement_Claim').values({
    egcs_fc_fundingagreement: input.agreementId,
    egcs_fc_fiscalyear: input.fiscalYearId,
    egcs_fc_isfinalforyear: input.isFinalForYear,
    egcs_fc_periodstart: input.periodStart,
    egcs_fc_periodend: input.periodEnd,
    egcs_fc_receiveddate: input.receivedDate,
    egcs_fc_gcformssubmissionuuid: input.submissionUuid,
    egcs_fc_status: draftStatusId
  } satisfies Insertable<Database['Funding_Case_Agreement_Claim']>)
    .returningAll()
    .executeTakeFirstOrThrow()

  const lineItemIds: string[] = []
  for (const line of input.lineItems) {
    const lineItem = await trx.insertInto('Funding_Case_Agreement_Claim_Line_Item').values({
      egcs_fc_fundingagreementclaim: String(claim.id),
      egcs_fc_fundingagreementbudgetlineitem: line.budgetLineItemId,
      egcs_fc_submittedcostcategory: line.submittedCostCategory,
      egcs_fc_submittedcostsubsection: line.submittedCostSubsection,
      egcs_fc_submittedlineitem: line.submittedLineItem,
      egcs_fc_description: line.description,
      egcs_fc_amount: databaseMoneyValue(parseMoney(line.amount)),
      egcs_fc_currency: line.currency as Database['Funding_Case_Agreement_Claim_Line_Item']['egcs_fc_currency']
    })
      .returning('id')
      .executeTakeFirstOrThrow()
    lineItemIds.push(String(lineItem.id))
  }

  await createPrimaryEntityAssignment(
    trx,
    'fundingcaseagreementclaim',
    String(claim.id),
    creatorId
  )
  return {
    status: 'created',
    claim,
    claimId: String(claim.id),
    lineItemIds,
    draftStatusId
  }
}

export const prepareAgreementClaimRoute = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  assignmentTarget?: ExactEntityTarget<AssignableEntityType>
) => {
  const db = event.context.$db as Kysely<Database>
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, action, agreementId, db, { assignmentTarget })
  if (!agreementContext) {
    return await badRequest(event, 'AGREEMENT_NOT_FOUND', 'apiErrors.agreement.not_found')
  }

  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  return {
    agreementId,
    agreementContext,
    db
  }
}

export type AgreementClaimRuntimeContext = {
  claimId: string
  agreementId: string
  streamId: string
  agencyId: string
  isOpen: boolean
}

export type AgreementClaimReconcileRuntimeContext = AgreementClaimRuntimeContext & {
  reconcileId: string
}

const hasCompletionEvidence = async (
  db: AgreementClaimDb,
  entityType: 'fundingcaseagreementclaim' | 'fundingclaimreconcile',
  entityId: string
) => Boolean(await db.selectFrom('Common_Completion').select('id')
  .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId)
  .where('_deleted', '=', false).executeTakeFirst())

const isReadOnlyBusinessStatus = async (db: AgreementClaimDb, statusId: string) => {
  const status = await db.selectFrom('Common_Status').select(['egcs_cn_readonly', 'egcs_cn_terminal'])
    .where('id', '=', statusId).where('_deleted', '=', false).executeTakeFirst()
  return !status || status.egcs_cn_readonly || status.egcs_cn_terminal
}

export const assertAgreementClaimBudgetFiscalYear = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  budgetFiscalYearId: string
) => {
  const fiscalYear = await db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .where(budgetFiscalYearStableId, '=', budgetFiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select(budgetFiscalYearStableId.as('id'))
    .executeTakeFirst()

  if (!fiscalYear) {
    return await badRequest(event, 'INVALID_AGREEMENT_CLAIM_FISCAL_YEAR', 'apiErrors.agreement.invalid_claim_fiscal_year')
  }

  return fiscalYear
}

export const getAgreementClaim = async (
  db: AgreementClaimDb,
  agreementId: string,
  claimId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Claim')
  .select([
    'id',
    'egcs_fc_fundingagreement',
    'egcs_fc_fiscalyear',
    'egcs_fc_periodstart',
    'egcs_fc_periodend',
    'egcs_fc_status'
  ])
  .where('id', '=', claimId)
  .where('egcs_fc_fundingagreement', '=', agreementId)
  .where('_deleted', '=', false)
  .executeTakeFirst()

export const assertAgreementClaimExists = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  claimId: string
) => {
  const claim = await getAgreementClaim(db, agreementId, claimId)

  if (!claim) {
    return await badRequest(event, 'AGREEMENT_CLAIM_NOT_FOUND', 'apiErrors.agreement.claim_not_found')
  }

  return claim
}

export const hasApprovedFinalAgreementClaimReconcile = async (
  db: AgreementClaimDb,
  claimId: string
) => {
  const reconciles = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('id')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('egcs_fc_isfinal', '=', true)
    .where('_deleted', '=', false)
    .execute()

  const evidence = await Promise.all(reconciles.map(reconcile =>
    hasApprovedTargetEvidence(db, 'fundingclaimreconcile', String(reconcile.id))))
  return evidence.some(Boolean)
}

export const assertNoApprovedFinalAgreementClaimReconcile = async (
  event: H3Event,
  db: AgreementClaimDb,
  claimId: string
) => {
  if (await hasApprovedFinalAgreementClaimReconcile(db, claimId)) {
    return await badRequest(
      event,
      'AGREEMENT_CLAIM_FINAL_RECONCILE_APPROVED',
      'apiErrors.agreement.final_claim_reconcile_approved'
    )
  }

  return null
}

export const hasCompletedFinalAgreementClaimReconcile = async (
  db: AgreementClaimDb,
  claimId: string
) => {
  const reconciles = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('id')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('egcs_fc_isfinal', '=', true)
    .where('_deleted', '=', false)
    .execute()

  const completionStates = await Promise.all(reconciles.map(reconcile =>
    hasPositiveCompletionTerminus(db, 'fundingclaimreconcile', String(reconcile.id))))
  return completionStates.some(Boolean)
}

export const assertNoCompletedFinalAgreementClaimReconcile = async (
  event: H3Event,
  db: AgreementClaimDb,
  claimId: string
) => {
  if (await hasCompletedFinalAgreementClaimReconcile(db, claimId)) {
    return await badRequest(
      event,
      'AGREEMENT_CLAIM_FINAL_RECONCILE_COMPLETED',
      'apiErrors.agreement.final_claim_reconcile_completed'
    )
  }

  return null
}

export const assertSingleFinalAgreementClaimReconcile = async (
  event: H3Event,
  db: AgreementClaimDb,
  claimId: string,
  reconcileId?: string
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('id')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('egcs_fc_isfinal', '=', true)
    .where('egcs_fc_isopen', '=', true)
    .where('_deleted', '=', false)

  if (reconcileId) {
    query = query.where('id', '!=', reconcileId)
  }

  const existingFinal = await query.executeTakeFirst()

  if (existingFinal) {
    return await badRequest(
      event,
      'AGREEMENT_DUPLICATE_FINAL_CLAIM_RECONCILE',
      'apiErrors.agreement.duplicate_final_claim_reconcile'
    )
  }

  return null
}

export const assertNoInProgressAgreementClaimReconcile = async (
  event: H3Event,
  db: AgreementClaimDb,
  claimId: string,
  reconcileId?: string
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('id')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('egcs_fc_isopen', '=', true)
    .where('_deleted', '=', false)

  if (reconcileId) {
    query = query.where('id', '!=', reconcileId)
  }

  if (await query.executeTakeFirst()) {
    return await badRequest(
      event,
      'AGREEMENT_CLAIM_RECONCILE_IN_PROGRESS',
      'apiErrors.agreement.claim_reconcile_in_progress'
    )
  }

  return null
}

export const assertAgreementClaimEditable = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  claimId: string
) => {
  const claim = await assertAgreementClaimExists(event, db, agreementId, claimId)
  if (!claim || typeof claim !== 'object' || !('id' in claim)) {
    return claim
  }

  if (await isReadOnlyBusinessStatus(db, claim.egcs_fc_status)
    || await hasCompletionEvidence(db, 'fundingcaseagreementclaim', claimId)) {
    return await badRequest(event, 'AGREEMENT_CLAIM_LOCKED', 'apiErrors.request.invalid_status')
  }

  return claim
}

export const lockAgreementClaimForUpdate = async (
  trx: Transaction<Database>,
  claimId: string
) => {
  return await lockAgreementAggregate(trx, 'claim', claimId)
}

export const lockAgreementClaimEditable = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  claimId: string
) => {
  await lockAgreementClaimForUpdate(trx, claimId)
  return await assertAgreementClaimEditable(event, trx, agreementId, claimId)
}

export const executeAgreementClaimMutation = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  aggregateLocks: AgreementAggregateLock[] | ((trx: Transaction<Database>) => Promise<AgreementAggregateLock[]>),
  callback: (trx: Transaction<Database>) => Promise<T>,
  options: { action?: 'create' | 'update' | 'delete', businessStatusMode?: 'ordinary' | 'workflow' | 'engine' } = {}
): Promise<T> => {
  const resolveAndLockTargets = async (trx: Transaction<Database>) => {
    const locks = typeof aggregateLocks === 'function' ? await aggregateLocks(trx) : aggregateLocks
    await lockAgreementAggregates(trx, locks, agreementId)
    const reconciliationLocks = locks.filter(lock => lock.type === 'claimReconcile')
    if (reconciliationLocks.length > 0) return reconciliationLocks
    return locks.filter(lock => lock.type === 'claim')
  }

  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    initialContext,
    async trx => await callback(trx),
    {
      businessStatusMode: options.businessStatusMode,
      authorize: async (trx, _agreementContext, authContext) => {
        const workLocks = await resolveAndLockTargets(trx)
        if (workLocks.length === 0) return await forbidden(event)
        for (const lock of workLocks) {
          const entityType = lock.type === 'claim' ? 'fundingcaseagreementclaim' : 'fundingclaimreconcile'
          await assertBusinessStatusMutationAllowed(event, trx, entityType, lock.id, options.businessStatusMode)
          await authorizeFreshAssignedItem(event, trx, authContext, entityType, lock.id, options.action ?? 'update')
        }
      }
    }
  )
}

export const assertAgreementClaimReadyForReconcile = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  claimId: string
) => {
  const claim = await assertAgreementClaimExists(event, db, agreementId, claimId)
  if (!claim || typeof claim !== 'object' || !('id' in claim)) {
    return claim
  }

  if (!await hasPositiveCompletionTerminus(db, 'fundingcaseagreementclaim', claimId)) {
    return await badRequest(event, 'AGREEMENT_CLAIM_NOT_TERMINAL', 'apiErrors.agreement.claim_not_terminal')
  }

  const finalLock = await assertNoCompletedFinalAgreementClaimReconcile(event, db, claimId)
  if (finalLock) {
    return finalLock
  }

  return claim
}

export const assertAgreementClaimCanStartReconcile = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  claimId: string
) => {
  const claim = await assertAgreementClaimExists(event, db, agreementId, claimId)
  if (!claim || typeof claim !== 'object' || !('id' in claim)) {
    return claim
  }

  if (!await hasPositiveCompletionTerminus(db, 'fundingcaseagreementclaim', claimId)) {
    return await badRequest(event, 'AGREEMENT_CLAIM_NOT_TERMINAL', 'apiErrors.agreement.claim_not_terminal')
  }

  const unallocatedLineCount = await db
    .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .select(({ fn }) => fn.count('id').as('total'))
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('egcs_fc_fundingagreementbudgetlineitem', 'is', null)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (Number(unallocatedLineCount?.total ?? 0) > 0) {
    return await badRequest(event, 'AGREEMENT_CLAIM_LINES_UNALLOCATED', 'apiErrors.agreement.claim_lines_unallocated')
  }

  const finalLock = await assertNoCompletedFinalAgreementClaimReconcile(event, db, claimId)
  if (finalLock) {
    return finalLock
  }

  return claim
}

export const assertAgreementClaimBudgetLineItem = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  claimFiscalYearId: string,
  budgetLineItemId: string
) => {
  const lineItem = await db
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
    .where(budgetLineItemStableId, '=', budgetLineItemId)
    .where(budgetFiscalYearStableId, '=', claimFiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .select(budgetLineItemStableId.as('id'))
    .executeTakeFirst()

  if (!lineItem) {
    return await badRequest(event, 'INVALID_AGREEMENT_CLAIM_BUDGET_LINE_ITEM', 'apiErrors.agreement.invalid_claim_budget_line_item')
  }

  return lineItem
}

export const assertAgreementClaimLineItemForAgreement = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  lineItemId: string
) => {
  const lineItem = await db
    .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim'
    )
    .where('Funding_Case_Agreement_Claim_Line_Item.id', '=', lineItemId)
    .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Claim_Line_Item.id as id',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim',
      'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem as egcs_fc_fundingagreementbudgetlineitem',
      'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear as claim_fiscalyear',
      'Funding_Case_Agreement_Claim.egcs_fc_status as claim_status'
    ])
    .executeTakeFirst()

  if (!lineItem) {
    return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
  }

  return lineItem
}

export const assertAgreementClaimLineItemBelongsToClaim = async (
  event: H3Event,
  db: Kysely<Database>,
  claimId: string,
  lineItemId: string
) => {
  const lineItem = await db
    .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
    .where('id', '=', lineItemId)
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  if (!lineItem) {
    return await badRequest(event, 'AGREEMENT_CLAIM_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_line_item_not_found')
  }

  return lineItem
}

const hasKey = <TKey extends string>(
  value: unknown,
  key: TKey
): value is Record<TKey, unknown> => value !== null && typeof value === 'object' && key in value

const readAgreementClaimLineItemPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, FundingCaseAgreementClaimLineItemPatchSchema)
}

const readAgreementClaimReconcileLineItemPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, FundingCaseAgreementClaimReconcileLineItemPatchSchema)
}

const readAgreementClaimReconcilePatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, FundingCaseAgreementClaimReconcilePatchSchema)
}

const validateAgreementClaimLineItemPatchReferences = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  existing: Record<'egcs_fc_fundingagreementclaim', unknown> & {
    egcs_fc_fundingagreementbudgetlineitem?: unknown
    claim_status?: unknown
  },
  patchValues: FundingCaseAgreementClaimLineItemPatch
) => {
  const nextClaimId = String(patchValues.egcs_fc_fundingagreementclaim ?? existing.egcs_fc_fundingagreementclaim)
  const patchKeys = Object.keys(patchValues)
  const isAllocationOnlyPatch = patchKeys.length === 1
    && patchKeys[0] === 'egcs_fc_fundingagreementbudgetlineitem'
    && patchValues.egcs_fc_fundingagreementbudgetlineitem !== null
    && patchValues.egcs_fc_fundingagreementbudgetlineitem !== undefined
    && existing.egcs_fc_fundingagreementbudgetlineitem === null
    && nextClaimId === String(existing.egcs_fc_fundingagreementclaim)

  const editableClaim = await assertAgreementClaimEditable(event, db, agreementId, String(existing.egcs_fc_fundingagreementclaim))
  if (!hasKey(editableClaim, 'id')) {
    return editableClaim
  }

  const nextClaim = isAllocationOnlyPatch
    ? await assertAgreementClaimExists(event, db, agreementId, nextClaimId)
    : await assertAgreementClaimEditable(event, db, agreementId, nextClaimId)
  if (!hasKey(nextClaim, 'egcs_fc_fiscalyear')) {
    return nextClaim
  }

  const nextBudgetLineItemId = Object.hasOwn(patchValues, 'egcs_fc_fundingagreementbudgetlineitem')
    ? patchValues.egcs_fc_fundingagreementbudgetlineitem
    : existing.egcs_fc_fundingagreementbudgetlineitem

  if (nextBudgetLineItemId !== null && nextBudgetLineItemId !== undefined) {
    const budgetLineItem = await assertAgreementClaimBudgetLineItem(event, db, agreementId, String(nextClaim.egcs_fc_fiscalyear), String(nextBudgetLineItemId))
    if (!hasKey(budgetLineItem, 'id')) {
      return budgetLineItem
    }
  }

  return { nextClaimId }
}

const syncAgreementClaimLineItemPatchStatuses = async (
  db: Kysely<Database>,
  currentClaimId: string,
  nextClaimId: string
) => {
  await syncAgreementClaimEditingStatus(db, currentClaimId)
  if (nextClaimId !== currentClaimId) {
    await syncAgreementClaimEditingStatus(db, nextClaimId)
  }
}

export const patchAgreementClaimLineItem = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  lineId: string
) => {
  const patchValues = await readAgreementClaimLineItemPatchBody(event)
  const { egcs_fc_amount: patchedAmount, ...nonMoneyPatchValues } = patchValues
  const updateValues = {
    ...nonMoneyPatchValues,
    ...(patchedAmount === undefined
      ? {}
      : { egcs_fc_amount: databaseMoneyValue(patchedAmount) })
  }

  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      initialContext,
      async trx => {
        const child = await trx
          .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
          .select('egcs_fc_fundingagreementclaim')
          .where('id', '=', lineId)
          .where('_deleted', '=', false)
          .executeTakeFirst()
        if (!child) return []
        return [
          { type: 'claim', id: String(child.egcs_fc_fundingagreementclaim) },
          { type: 'claim', id: String(patchValues.egcs_fc_fundingagreementclaim ?? child.egcs_fc_fundingagreementclaim) }
        ]
      },
      async trx => {
        const existing = await assertAgreementClaimLineItemForAgreement(event, trx, agreementId, lineId)
        if (!hasKey(existing, 'egcs_fc_fundingagreementclaim')) {
          return existing
        }

        const references = await validateAgreementClaimLineItemPatchReferences(event, trx, agreementId, existing, patchValues)
        if (!hasKey(references, 'nextClaimId')) {
          return references
        }

        const updated = await trx
          .updateTable('Funding_Case_Agreement_Claim_Line_Item')
          .set(updateValues)
          .where('id', '=', lineId)
          .where('egcs_fc_fundingagreementclaim', '=', String(existing.egcs_fc_fundingagreementclaim))
          .where('_deleted', '=', false)
          .returning([
            'id', 'egcs_fc_fundingagreementclaim', 'egcs_fc_fundingagreement',
            'egcs_fc_fundingagreementbudgetlineitem', 'egcs_fc_submittedcostcategory',
            'egcs_fc_submittedcostsubsection', 'egcs_fc_submittedlineitem',
            'egcs_fc_description', 'egcs_fc_currency', '_deleted',
            databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementClaimLineItemPatchStatuses(trx, String(existing.egcs_fc_fundingagreementclaim), String(references.nextClaimId))

        return { ...updated, egcs_fc_amount: parseDatabaseMoney(updated.egcs_fc_amount) }
      }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

export const syncAgreementClaimEditingStatus = async (
  _db: AgreementClaimDb,
  _claimId: string
) => {
  // Ordinary edits preserve the Agency-configured business status.
}

export const patchAgreementClaimForRoute = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  claimId: string
) => {
  const patchValues = await readValidatedBodyI18n(event, FundingCaseAgreementClaimPatchSchema)

  return await executeAgreementClaimMutation(event, db, agreementId, initialContext, [{ type: 'claim', id: claimId }], async trx => {
    const claim = await assertAgreementClaimEditable(event, trx, agreementId, claimId)
    if (!claim || typeof claim !== 'object' || !('id' in claim)) {
      return claim
    }

    await validateMergedFinancialPeriodPatch(event, claim, patchValues)

    if (Object.hasOwn(patchValues, 'egcs_fc_fiscalyear')) {
      const fiscalYear = await assertAgreementClaimBudgetFiscalYear(event, trx, agreementId, String(patchValues.egcs_fc_fiscalyear))
      if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
        return fiscalYear
      }
      if (String(patchValues.egcs_fc_fiscalyear) !== String(claim.egcs_fc_fiscalyear)) {
        const mismatchedLine = await trx
          .selectFrom('Funding_Case_Agreement_Claim_Line_Item')
          .innerJoin(
            'Funding_Case_Agreement_Budget_Line_Item',
            'Funding_Case_Agreement_Budget_Line_Item.id',
            'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementbudgetlineitem'
          )
          .innerJoin(
            'Funding_Case_Agreement_Budget_Fiscal_Year',
            'Funding_Case_Agreement_Budget_Fiscal_Year.id',
            'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear'
          )
          .select('Funding_Case_Agreement_Claim_Line_Item.id')
          .where('Funding_Case_Agreement_Claim_Line_Item.egcs_fc_fundingagreementclaim', '=', claimId)
          .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
          .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
          .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
          .where(budgetFiscalYearStableId, '!=', String(patchValues.egcs_fc_fiscalyear))
          .forUpdate('Funding_Case_Agreement_Claim_Line_Item')
          .executeTakeFirst()
        if (mismatchedLine) {
          return await badRequest(event, 'AGREEMENT_CLAIM_FISCAL_YEAR_IN_USE', 'apiErrors.request.invalid_status')
        }
      }
    }

    const updated = await trx
      .updateTable('Funding_Case_Agreement_Claim')
      .set(patchValues)
      .where('id', '=', claimId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .returningAll()
      .executeTakeFirstOrThrow()

    return updated
  })
}

const cancelClaimWorkflow = async (event: H3Event, trx: Transaction<Database>, claimId: string) => {
  const { cancelWorkflowRun } = await import('~~/server/utils/workflow-runtime')
  const activeRun = await trx.selectFrom('Common_Runtime')
    .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
    .selectAll('Common_Runtime')
    .select('Common_Workflow_Run.egcs_cn_completion')
    .where('Common_Runtime.egcs_cn_kind', '=', 'workflow')
    .where('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseagreementclaim')
    .where('Common_Runtime.egcs_cn_entityid', '=', claimId)
    .where('Common_Runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where('Common_Runtime._deleted', '=', false)
    .forUpdate(['Common_Runtime', 'Common_Workflow_Run']).executeTakeFirst()
  if (!activeRun) return await badRequest(event, 'AGREEMENT_CLAIM_WORKFLOW_REQUIRED', 'apiErrors.request.invalid_status')
  const actor = await resolveCurrentCommonUser(event, trx as unknown as Kysely<Database>)
  if (!actor) return await unauthorized(event)
  return await cancelWorkflowRun(trx, activeRun, actor.id)
}

export const withdrawAgreementClaim = async (
  event: H3Event,
  db: Transaction<Database>,
  agreementId: string,
  claimId: string
) => {
  const claim = await assertAgreementClaimExists(event, db, agreementId, claimId)
  if (!claim || typeof claim !== 'object' || !('id' in claim)) {
    return claim
  }

  const activeReconcile = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('id')
    .where('egcs_fc_fundingagreementclaim', '=', claimId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (activeReconcile) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_STARTED', 'apiErrors.request.invalid_status')
  }

  return await cancelClaimWorkflow(event, db, claimId)
}

export const cancelAgreementClaim = async (
  event: H3Event,
  db: Transaction<Database>,
  agreementId: string,
  claimId: string
) => {
  const claim = await assertAgreementClaimExists(event, db, agreementId, claimId)
  if (!claim || typeof claim !== 'object' || !('id' in claim)) {
    return claim
  }

  return await cancelClaimWorkflow(event, db, claimId)
}

export const resolveAgreementClaimRuntimeContext = async (
  db: AgreementClaimDb,
  claimId: string
): Promise<AgreementClaimRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(claimId)) return null
  const resolveSnapshot = async (snapshotDb: AgreementClaimDb) => {
    const row = await snapshotDb
      .selectFrom('Funding_Case_Agreement_Claim')
      .innerJoin(
        'Funding_Case_Agreement_Profile',
        'Funding_Case_Agreement_Profile.id',
        'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement'
      )
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .select([
        'Funding_Case_Agreement_Claim.id as claim_id',
        'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as agreement_id',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
        'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
      ])
      .where('Funding_Case_Agreement_Claim.id', '=', claimId)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .where('Transfer_Payment_Stream._deleted', '=', false)
      .where('Transfer_Payment_Profile._deleted', '=', false)
      .executeTakeFirst()

    if (!row?.claim_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
      return null
    }

    return {
      claimId: String(row.claim_id),
      agreementId: String(row.agreement_id),
      streamId: String(row.stream_id),
      agencyId: String(row.agency_id),
      isOpen: !await hasCompletedFinalAgreementClaimReconcile(snapshotDb, claimId)
    }
  }

  return db.isTransaction
    ? await resolveSnapshot(db)
    : await db.transaction().setIsolationLevel('repeatable read').execute(resolveSnapshot)
}

export const assertAgreementClaimReconcileExists = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  reconcileId: string
) => {
  const reconcile = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim'
    )
    .select([
      'Funding_Case_Agreement_Claim_Reconcile.id as id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim as egcs_fc_fundingagreementclaim',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_status as egcs_fc_status',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal as egcs_fc_isfinal',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isopen as egcs_fc_isopen',
      'Funding_Case_Agreement_Claim.egcs_fc_status as claim_status'
    ])
    .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', reconcileId)
    .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .executeTakeFirst()

  if (!reconcile) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  return reconcile
}

export const assertAgreementClaimReconcileEditable = async (
  event: H3Event,
  db: AgreementClaimDb,
  agreementId: string,
  reconcileId: string
) => {
  const reconcile = await assertAgreementClaimReconcileExists(event, db, agreementId, reconcileId)
  if (!reconcile || typeof reconcile !== 'object' || !('id' in reconcile)) {
    return reconcile
  }

  if (!await hasPositiveCompletionTerminus(db, 'fundingcaseagreementclaim', String(reconcile.egcs_fc_fundingagreementclaim))) {
    return await badRequest(event, 'AGREEMENT_CLAIM_NOT_TERMINAL', 'apiErrors.agreement.claim_not_terminal')
  }

  if (await isReadOnlyBusinessStatus(db, reconcile.egcs_fc_status)) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LOCKED', 'apiErrors.request.invalid_status')
  }

  const completion = await db
    .selectFrom('Common_Completion')
    .select('id')
    .where('egcs_cn_entitytype', '=', 'fundingclaimreconcile')
    .where('egcs_cn_entityid', '=', reconcileId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (completion) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LOCKED', 'apiErrors.request.invalid_status')
  }

  if (reconcile.egcs_fc_isopen === false) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_CLOSED', 'apiErrors.request.invalid_status')
  }

  const finalLock = await assertNoCompletedFinalAgreementClaimReconcile(
    event,
    db,
    String(reconcile.egcs_fc_fundingagreementclaim)
  )
  if (finalLock) {
    return finalLock
  }

  return reconcile
}

export const lockAgreementClaimReconcileForUpdate = async (
  trx: Transaction<Database>,
  reconcileId: string
): Promise<string | null> => {
  const candidate = await trx
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('egcs_fc_fundingagreementclaim')
    .where('id', '=', reconcileId)
    .executeTakeFirst()

  if (!candidate) {
    return null
  }

  const claimId = String(candidate.egcs_fc_fundingagreementclaim)
  await lockAgreementAggregate(trx, 'claim', claimId)
  await lockAgreementAggregate(trx, 'claimReconcile', reconcileId)

  const lockedCandidate = await trx
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .select('egcs_fc_fundingagreementclaim')
    .where('id', '=', reconcileId)
    .executeTakeFirst()

  if (!lockedCandidate || String(lockedCandidate.egcs_fc_fundingagreementclaim) !== claimId) {
    return null
  }

  return claimId
}

export const lockAgreementClaimReconcileEditable = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  reconcileId: string
) => {
  const claimId = await lockAgreementClaimReconcileForUpdate(trx, reconcileId)
  if (!claimId) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_not_found')
  }

  return await assertAgreementClaimReconcileEditable(event, trx, agreementId, reconcileId)
}

export const assertAgreementClaimReconcileLineItemForAgreement = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  lineItemId: string
) => {
  const lineItem = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
    .innerJoin(
      'Funding_Case_Agreement_Claim_Reconcile',
      'Funding_Case_Agreement_Claim_Reconcile.id',
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile'
    )
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim'
    )
    .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item.id', '=', lineItemId)
    .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.id as id',
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile as egcs_fc_fundingagreementclaimreconcile',
      'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem as egcs_fc_lineitem',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim as claim_id'
    ])
    .executeTakeFirst()

  if (!lineItem) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found')
  }

  return lineItem
}

const resolveAgreementClaimReconcileLineItemPatchTarget = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  existing: Record<'egcs_fc_fundingagreementclaimreconcile' | 'egcs_fc_lineitem' | 'claim_id', unknown>,
  patchValues: FundingCaseAgreementClaimReconcileLineItemPatch
) => {
  const reconcile = await assertAgreementClaimReconcileEditable(event, db, agreementId, String(existing.egcs_fc_fundingagreementclaimreconcile))
  if (!hasKey(reconcile, 'egcs_fc_fundingagreementclaim')) {
    return reconcile
  }

  if (!Object.hasOwn(patchValues, 'egcs_fc_fundingagreementclaimreconcile')) {
    return {
      nextClaimId: String(existing.claim_id),
      nextReconcileId: String(existing.egcs_fc_fundingagreementclaimreconcile)
    }
  }

  const nextReconcileId = String(patchValues.egcs_fc_fundingagreementclaimreconcile)
  const nextReconcile = await assertAgreementClaimReconcileEditable(event, db, agreementId, nextReconcileId)
  if (!hasKey(nextReconcile, 'egcs_fc_fundingagreementclaim')) {
    return nextReconcile
  }

  return {
    nextClaimId: String(nextReconcile.egcs_fc_fundingagreementclaim),
    nextReconcileId
  }
}

const validateAgreementClaimReconcileLineItemPatchReferences = async (
  event: H3Event,
  db: Kysely<Database>,
  nextClaimId: string,
  existingLineItemId: unknown,
  patchValues: FundingCaseAgreementClaimReconcileLineItemPatch
) => {
  const nextLineItemId = String(patchValues.egcs_fc_lineitem ?? existingLineItemId)
  const lineItem = await assertAgreementClaimLineItemBelongsToClaim(event, db, nextClaimId, nextLineItemId)
  if (!hasKey(lineItem, 'id')) {
    return lineItem
  }

  return lineItem
}

const syncAgreementClaimReconcileLineItemPatchStatuses = async (
  db: Kysely<Database>,
  currentReconcileId: string,
  nextReconcileId: string
) => {
  await syncAgreementClaimReconcileEditingStatus(db, currentReconcileId)
  if (nextReconcileId !== currentReconcileId) {
    await syncAgreementClaimReconcileEditingStatus(db, nextReconcileId)
  }
}

export const patchAgreementClaimReconcileLineItem = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  lineId: string,
  expectedReconcileId?: string
) => {
  const patchValues = await readAgreementClaimReconcileLineItemPatchBody(event)
  const {
    egcs_fc_reconciled: patchedReconciled,
    egcs_fc_sampled: patchedSampled,
    ...nonMoneyPatchValues
  } = patchValues
  const updateValues = {
    ...nonMoneyPatchValues,
    ...(patchedReconciled === undefined
      ? {}
      : { egcs_fc_reconciled: databaseMoneyValue(patchedReconciled) }),
    ...(patchedSampled === undefined
      ? {}
      : { egcs_fc_sampled: patchedSampled === null ? null : databaseMoneyValue(patchedSampled) })
  }

  if (
    expectedReconcileId
    && patchValues.egcs_fc_fundingagreementclaimreconcile !== undefined
    && String(patchValues.egcs_fc_fundingagreementclaimreconcile) !== expectedReconcileId
  ) {
    return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found')
  }

  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      initialContext,
      async trx => {
        let childQuery = trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .select('egcs_fc_fundingagreementclaimreconcile')
          .where('id', '=', lineId)
          .where('_deleted', '=', false)
        if (expectedReconcileId) {
          childQuery = childQuery.where('egcs_fc_fundingagreementclaimreconcile', '=', expectedReconcileId)
        }
        const child = await childQuery.executeTakeFirst()
        if (!child) return []
        const currentReconcileId = String(child.egcs_fc_fundingagreementclaimreconcile)
        const nextReconcileId = String(patchValues.egcs_fc_fundingagreementclaimreconcile ?? currentReconcileId)
        const reconciles = await trx
          .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
          .select(['id', 'egcs_fc_fundingagreementclaim'])
          .where('id', 'in', [...new Set([currentReconcileId, nextReconcileId])])
          .execute()
        return reconciles.flatMap(reconcile => [
          { type: 'claim' as const, id: String(reconcile.egcs_fc_fundingagreementclaim) },
          { type: 'claimReconcile' as const, id: String(reconcile.id) }
        ])
      },
      async trx => {
        const existing = await assertAgreementClaimReconcileLineItemForAgreement(event, trx, agreementId, lineId)
        if (!hasKey(existing, 'egcs_fc_fundingagreementclaimreconcile') || !hasKey(existing, 'egcs_fc_lineitem') || !hasKey(existing, 'claim_id')) {
          return existing
        }
        if (expectedReconcileId && String(existing.egcs_fc_fundingagreementclaimreconcile) !== expectedReconcileId) {
          return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_NOT_FOUND', 'apiErrors.agreement.claim_reconcile_line_item_not_found')
        }

        const target = await resolveAgreementClaimReconcileLineItemPatchTarget(event, trx, agreementId, existing, patchValues)
        if (!hasKey(target, 'nextClaimId') || !hasKey(target, 'nextReconcileId')) {
          return target
        }

        const lineItem = await validateAgreementClaimReconcileLineItemPatchReferences(
          event,
          trx,
          String(target.nextClaimId),
          existing.egcs_fc_lineitem,
          patchValues
        )
        if (!hasKey(lineItem, 'id')) {
          return lineItem
        }

        const updated = await trx
          .updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .set(updateValues)
          .where('id', '=', lineId)
          .where('egcs_fc_fundingagreementclaimreconcile', '=', String(existing.egcs_fc_fundingagreementclaimreconcile))
          .where('_deleted', '=', false)
          .returning([
            'id', 'egcs_fc_fundingagreementclaimreconcile', 'egcs_fc_fundingagreementclaim',
            'egcs_fc_lineitem', 'egcs_fc_rationale', '_deleted',
            databaseMoneyText(sql.ref('egcs_fc_reconciled')).as('egcs_fc_reconciled'),
            databaseMoneyText(sql.ref('egcs_fc_sampled')).as('egcs_fc_sampled')
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementClaimReconcileLineItemPatchStatuses(
          trx,
          String(existing.egcs_fc_fundingagreementclaimreconcile),
          String(target.nextReconcileId)
        )

        return {
          ...updated,
          egcs_fc_reconciled: parseDatabaseMoney(updated.egcs_fc_reconciled),
          egcs_fc_sampled: updated.egcs_fc_sampled == null ? updated.egcs_fc_sampled : parseDatabaseMoney(updated.egcs_fc_sampled)
        }
      }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

const validateAgreementClaimReconcilePatch = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  reconcileId: string,
  existing: Record<'egcs_fc_fundingagreementclaim' | 'egcs_fc_isfinal', unknown>,
  patchValues: FundingCaseAgreementClaimReconcilePatch
) => {
  if (Object.hasOwn(patchValues, 'egcs_fc_fundingagreementclaim')) {
    const claim = await assertAgreementClaimReadyForReconcile(event, db, agreementId, String(patchValues.egcs_fc_fundingagreementclaim))
    if (!hasKey(claim, 'id')) {
      return claim
    }
  }

  const nextClaimId = String(patchValues.egcs_fc_fundingagreementclaim ?? existing.egcs_fc_fundingagreementclaim)
  const nextIsFinal = patchValues.egcs_fc_isfinal ?? existing.egcs_fc_isfinal
  if (nextIsFinal) {
    const finalConflict = await assertSingleFinalAgreementClaimReconcile(event, db, nextClaimId, reconcileId)
    if (finalConflict) {
      return finalConflict
    }
    const inProgressConflict = await assertNoInProgressAgreementClaimReconcile(event, db, nextClaimId, reconcileId)
    if (inProgressConflict) {
      return inProgressConflict
    }
  }

  return null
}

export const patchAgreementClaimReconcile = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  reconcileId: string
) => {
  const patchValues = await readAgreementClaimReconcilePatchBody(event)

  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      initialContext,
      async trx => {
        const reconcile = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('egcs_fc_fundingagreementclaim').where('id', '=', reconcileId).where('_deleted', '=', false).executeTakeFirst()
        if (!reconcile) return []
        return [
          { type: 'claim', id: String(reconcile.egcs_fc_fundingagreementclaim) },
          { type: 'claim', id: String(patchValues.egcs_fc_fundingagreementclaim ?? reconcile.egcs_fc_fundingagreementclaim) },
          { type: 'claimReconcile', id: reconcileId }
        ]
      },
      async trx => {
        const existing = await assertAgreementClaimReconcileEditable(event, trx, agreementId, reconcileId)
        if (!hasKey(existing, 'id') || !hasKey(existing, 'egcs_fc_fundingagreementclaim') || !hasKey(existing, 'egcs_fc_isfinal')) {
          return existing
        }

        const validationError = await validateAgreementClaimReconcilePatch(event, trx, agreementId, reconcileId, existing, patchValues)
        if (validationError) {
          return validationError
        }

        const updated = await trx
          .updateTable('Funding_Case_Agreement_Claim_Reconcile')
          .set(patchValues)
          .where('id', '=', reconcileId)
          .where('egcs_fc_fundingagreementclaim', '=', String(existing.egcs_fc_fundingagreementclaim))
          .where('_deleted', '=', false)
          .returningAll()
          .executeTakeFirstOrThrow()

        await syncAgreementClaimReconcileEditingStatus(trx, reconcileId)

        return updated
      }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

const compareDatabaseIds = (left: string, right: string): number => {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
}

export const saveAgreementClaimReconcileLineItemsBulk = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  reconcileId: string,
  input: FundingCaseAgreementClaimReconcileLineItemBulkSave
) => {
  try {
    return await executeAgreementClaimMutation(
      event,
      db,
      agreementId,
      initialContext,
      [
        { type: 'claimReconcile', id: reconcileId }
      ],
      async trx => {
        const reconcile = await assertAgreementClaimReconcileEditable(event, trx, agreementId, reconcileId)
        if (!hasKey(reconcile, 'id') || !hasKey(reconcile, 'egcs_fc_fundingagreementclaim') || !hasKey(reconcile, 'egcs_fc_isfinal')) {
          return reconcile
        }

        const claimId = String(reconcile.egcs_fc_fundingagreementclaim)
        const [claimLines, existingLines] = await Promise.all([
          trx.selectFrom('Funding_Case_Agreement_Claim_Line_Item')
            .select('id')
            .where('egcs_fc_fundingagreementclaim', '=', claimId)
            .where('_deleted', '=', false)
            .orderBy('id')
            .forUpdate()
            .execute(),
          trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
            .select(['id', 'egcs_fc_lineitem', 'egcs_fc_fundingagreementclaimreconcile'])
            .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
            .where('_deleted', '=', false)
            .orderBy('egcs_fc_lineitem')
            .forUpdate()
            .execute()
        ])
        const submitted = [...input.lines].sort((left, right) => compareDatabaseIds(left.claim_line_id, right.claim_line_id))
        const expectedClaimLineIds = claimLines.map(line => String(line.id)).sort(compareDatabaseIds)
        if (
          submitted.length !== expectedClaimLineIds.length
          || submitted.some((line, index) => line.claim_line_id !== expectedClaimLineIds[index])
          || existingLines.some(line => !expectedClaimLineIds.includes(String(line.egcs_fc_lineitem)))
        ) {
          return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_SET_STALE', 'apiErrors.request.invalid')
        }

        const existingByClaimLineId = new Map(existingLines.map(line => [String(line.egcs_fc_lineitem), line]))
        for (const line of submitted) {
          const existing = existingByClaimLineId.get(line.claim_line_id)
          const submittedLineId = line.reconcile_line_id ?? null
          if (
            (existing && submittedLineId !== String(existing.id))
            || (!existing && submittedLineId !== null)
            || (existing && String(existing.egcs_fc_fundingagreementclaimreconcile) !== reconcileId)
          ) {
            return await badRequest(event, 'AGREEMENT_CLAIM_RECONCILE_LINE_ITEM_STALE', 'apiErrors.request.invalid')
          }
        }

        if (input.egcs_fc_isfinal !== undefined) {
          const validationError = await validateAgreementClaimReconcilePatch(
            event,
            trx,
            agreementId,
            reconcileId,
            reconcile,
            { egcs_fc_isfinal: input.egcs_fc_isfinal }
          )
          if (validationError) return validationError
        }

        for (const line of submitted) {
          const existing = existingByClaimLineId.get(line.claim_line_id)
          const moneyValues = {
            egcs_fc_reconciled: databaseMoneyValue(line.egcs_fc_reconciled),
            ...(Object.hasOwn(line, 'egcs_fc_sampled')
              ? { egcs_fc_sampled: line.egcs_fc_sampled == null ? null : databaseMoneyValue(line.egcs_fc_sampled) }
              : {})
          }
          if (existing) {
            await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
              .set({
                ...moneyValues,
                ...(Object.hasOwn(line, 'egcs_fc_rationale') ? { egcs_fc_rationale: line.egcs_fc_rationale } : {})
              })
              .where('id', '=', String(existing.id))
              .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
              .where('egcs_fc_lineitem', '=', line.claim_line_id)
              .where('_deleted', '=', false)
              .executeTakeFirstOrThrow()
          } else {
            await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
              .values({
                egcs_fc_fundingagreementclaimreconcile: reconcileId,
                egcs_fc_lineitem: line.claim_line_id,
                ...moneyValues,
                ...(Object.hasOwn(line, 'egcs_fc_rationale') ? { egcs_fc_rationale: line.egcs_fc_rationale } : {})
              })
              .executeTakeFirstOrThrow()
          }
        }

        if (input.egcs_fc_isfinal !== undefined && input.egcs_fc_isfinal !== reconcile.egcs_fc_isfinal) {
          await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile')
            .set({ egcs_fc_isfinal: input.egcs_fc_isfinal })
            .where('id', '=', reconcileId)
            .where('egcs_fc_fundingagreementclaim', '=', claimId)
            .where('_deleted', '=', false)
            .executeTakeFirstOrThrow()
        }
        await syncAgreementClaimReconcileEditingStatus(trx, reconcileId)

        const rows = await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
          .select([
            'id', 'egcs_fc_fundingagreementclaimreconcile', 'egcs_fc_fundingagreementclaim',
            'egcs_fc_lineitem', 'egcs_fc_rationale', '_deleted',
            databaseMoneyText(sql.ref('egcs_fc_reconciled')).as('egcs_fc_reconciled'),
            databaseMoneyText(sql.ref('egcs_fc_sampled')).as('egcs_fc_sampled')
          ])
          .where('egcs_fc_fundingagreementclaimreconcile', '=', reconcileId)
          .where('_deleted', '=', false)
          .orderBy('egcs_fc_lineitem')
          .execute()
        return {
          lines: rows.map(row => ({
            ...row,
            egcs_fc_reconciled: parseDatabaseMoney(row.egcs_fc_reconciled),
            egcs_fc_sampled: row.egcs_fc_sampled == null ? row.egcs_fc_sampled : parseDatabaseMoney(row.egcs_fc_sampled)
          }))
        }
      }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}

export const syncAgreementClaimReconcileEditingStatus = async (
  _db: AgreementClaimDb,
  _reconcileId: string
) => {
  // Ordinary reconciliation edits preserve both parent and child business statuses.
}

export const resolveAgreementClaimReconcileRuntimeContext = async (
  db: AgreementClaimDb,
  reconcileId: string
): Promise<AgreementClaimReconcileRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(reconcileId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Claim_Reconcile')
    .innerJoin(
      'Funding_Case_Agreement_Claim',
      'Funding_Case_Agreement_Claim.id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim'
    )
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement'
    )
    .innerJoin(
      'Transfer_Payment_Stream',
      'Transfer_Payment_Stream.id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
    )
    .innerJoin(
      'Transfer_Payment_Profile',
      'Transfer_Payment_Profile.id',
      'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
    )
    .select([
      'Funding_Case_Agreement_Claim_Reconcile.id as reconcile_id',
      'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isopen as is_open',
      'Funding_Case_Agreement_Claim.id as claim_id',
      'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', reconcileId)
    .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
    .where('Funding_Case_Agreement_Claim._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row?.reconcile_id || !row.claim_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
    return null
  }

  return {
    reconcileId: String(row.reconcile_id),
    claimId: String(row.claim_id),
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id),
    isOpen: row.is_open
  }
}
