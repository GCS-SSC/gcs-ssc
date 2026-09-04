/* eslint-disable jsdoc/require-jsdoc -- Existing exported commitment helpers are intentionally documented by their descriptive names. */
import { getRouterParam, type H3Event } from 'h3'
import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import { badRequest, forbidden, throwApiError } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource, type AgreementScopeContext } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { lockAgreementAggregate, lockAgreementAggregates, type AgreementAggregateLock } from '~~/server/utils/agreement-aggregate-lock'
import { FundingCaseAgreementCommitmentLinePatchSchema } from '~~/shared/types/schemas'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { FundingCaseAgreementCommitmentLinePatch } from '~~/shared/types/schemas/funding-case-agreement'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { assertBusinessStatusMutationAllowed, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { getCommitmentLinePaymentCoverage } from '~~/server/utils/agreement-commitment-line-balance'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, compareMoney, type Money } from '~~/shared/utils/money'

type DbClient = Kysely<Database> | Transaction<Database>

const hasKey = <TKey extends string>(
  value: unknown,
  key: TKey
): value is Record<TKey, unknown> => value !== null && typeof value === 'object' && key in value

const readCommitmentLinePatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, FundingCaseAgreementCommitmentLinePatchSchema)
}

export const prepareAgreementCommitmentRoute = async (
  event: H3Event,
  action: 'create' | 'read' | 'update' | 'delete',
  assignmentTarget?: ExactEntityTarget<AssignableEntityType>,
  options: { db?: DbClient, freshAuth?: boolean } = {}
) => {
  const db = options.db ?? event.context.$db as Kysely<Database>
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const agreementContext = await authorizeAgreementResource(event, action, agreementId, db, {
    assignmentTarget,
    freshAuth: options.freshAuth
  })
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

export type AgreementCommitmentRuntimeContext = {
  commitmentId: string
  agreementId: string
  streamId: string
  agencyId: string
}

export const resolveAgreementCommitmentRuntimeContext = async (
  db: DbClient,
  commitmentId: string
): Promise<AgreementCommitmentRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(commitmentId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Commitment')
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement'
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
      'Funding_Case_Agreement_Commitment.id as commitment_id',
      'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Commitment.id', '=', commitmentId)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row?.commitment_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
    return null
  }

  return {
    commitmentId: String(row.commitment_id),
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id)
  }
}

export const getAgreementCommitment = async (
  db: DbClient,
  agreementId: string,
  commitmentId: string
) => await db
  .selectFrom('Funding_Case_Agreement_Commitment')
  .select([
    'id',
    'egcs_fc_fundingagreement',
    'egcs_fc_type',
    'egcs_fc_status',
    'egcs_fc_financialsystemnumber'
  ])
  .where('id', '=', commitmentId)
  .where('egcs_fc_fundingagreement', '=', agreementId)
  .where('_deleted', '=', false)
  .executeTakeFirst()

export const assertAgreementCommitmentEditable = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  commitmentId: string
) => {
  const commitment = await getAgreementCommitment(db, agreementId, commitmentId)

  if (!commitment) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcaseagreementcommitment', commitmentId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LOCKED', 'apiErrors.request.invalid_status')
  }

  const completion = await db
    .selectFrom('Common_Completion')
    .select('id')
    .where('egcs_cn_entitytype', '=', 'fundingcaseagreementcommitment')
    .where('egcs_cn_entityid', '=', commitmentId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (completion) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LOCKED', 'apiErrors.request.invalid_status')
  }

  return commitment
}

export const lockAgreementCommitmentEditable = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  commitmentId: string
) => {
  await lockAgreementAggregate(trx, 'commitment', commitmentId)
  return await assertAgreementCommitmentEditable(event, trx, agreementId, commitmentId)
}

export const executeAgreementCommitmentMutation = async <T>(
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  aggregateLocks: AgreementAggregateLock[] | ((trx: Transaction<Database>) => Promise<AgreementAggregateLock[]>),
  callback: (trx: Transaction<Database>, agreementContext: AgreementScopeContext) => Promise<T>,
  options: { action?: 'create' | 'update' | 'delete' } = {}
): Promise<T> => {
  return await executeFreshAuthorizedAgreementWrite(
    event,
    db,
    agreementId,
    initialContext,
    async (trx, currentContext) => await callback(trx, currentContext),
    {
      authorize: async (trx, _agreementContext, authContext) => {
        const locks = typeof aggregateLocks === 'function' ? await aggregateLocks(trx) : aggregateLocks
        await lockAgreementAggregates(trx, locks, agreementId)
        const commitmentLocks = locks.filter(lock => lock.type === 'commitment')
        if (commitmentLocks.length === 0) return await forbidden(event)
        for (const lock of commitmentLocks) {
          await assertBusinessStatusMutationAllowed(event, trx, 'fundingcaseagreementcommitment', lock.id)
          await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcaseagreementcommitment', lock.id, options.action ?? 'update')
        }
      }
    }
  )
}

export const syncAgreementCommitmentEditingStatus = async (
  _db: DbClient,
  _commitmentId: string
) => {
  // Ordinary commitment edits preserve the Agency-configured business status.
}

export const assertCommitmentTypeBelongsToAgreementStream = async (
  event: H3Event,
  db: DbClient,
  commitmentTypeId: string,
  streamId: string
) => {
  const commitmentType = await db.selectFrom('Transfer_Payment_Stream_Commitment_Type')
    .select('id')
    .where('id', '=', commitmentTypeId)
    .where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()
  if (!commitmentType) {
    return await badRequest(event, 'INVALID_AGREEMENT_COMMITMENT_TYPE', 'apiErrors.agreement.invalid_commitment_type')
  }
  return commitmentType
}

export const assertChartOfAccountBelongsToAgreementStream = async (
  event: H3Event,
  db: DbClient,
  chartOfAccountId: string,
  streamId: string
) => {
  const chartOfAccount = await db
    .selectFrom('Transfer_Payment_Stream_Chart_of_Account')
    .innerJoin(
      'Transfer_Payment_Stream_Budget',
      'Transfer_Payment_Stream_Budget.id',
      'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget'
    )
    .where('Transfer_Payment_Stream_Chart_of_Account.id', '=', chartOfAccountId)
    .where('Transfer_Payment_Stream_Chart_of_Account.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentstream', '=', streamId)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .select('Transfer_Payment_Stream_Chart_of_Account.id as id')
    .forUpdate('Transfer_Payment_Stream_Chart_of_Account')
    .executeTakeFirst()

  if (!chartOfAccount) {
    return await badRequest(event, 'INVALID_AGREEMENT_CHART_OF_ACCOUNT', 'apiErrors.agreement.invalid_chart_of_account')
  }

  return chartOfAccount
}

export const assertAgreementCommitmentLineForAgreement = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  lineId: string,
  options: { lockCommitmentLine?: boolean } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment'
    )
    .where('Funding_Case_Agreement_Commitment_Line.id', '=', lineId)
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Commitment_Line.id as id',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment as egcs_fc_commitment',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_transferpaymentstreamchartofaccount as egcs_fc_transferpaymentstreamchartofaccount',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')).as('egcs_fc_amount')
    ])
  if (options.lockCommitmentLine === true) {
    query = query.forUpdate('Funding_Case_Agreement_Commitment_Line')
  }
  return await assertAgreementChildExists(
    event,
    query.executeTakeFirst(),
    ...AGREEMENT_CHILD_ERROR_KEYS.commitmentLineNotFound
  )
}

const assertNextAgreementCommitmentEditable = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  commitmentId: string
) => {
  const editableCommitment = await assertAgreementCommitmentEditable(event, db, agreementId, commitmentId)
  if (editableCommitment) {
    return editableCommitment
  }

  return await assertAgreementChildExists(
    event,
    db
      .selectFrom('Funding_Case_Agreement_Commitment')
      .where('id', '=', commitmentId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .select('id')
      .executeTakeFirst(),
    ...AGREEMENT_CHILD_ERROR_KEYS.commitmentNotFound
  )
}

const validateAgreementCommitmentLinePatchReferences = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  streamId: string,
  existingLine: Record<'egcs_fc_commitment' | 'egcs_fc_transferpaymentstreamchartofaccount', unknown>,
  patchValues: FundingCaseAgreementCommitmentLinePatch
) => {
  const currentCommitment = await assertAgreementCommitmentEditable(event, db, agreementId, String(existingLine.egcs_fc_commitment))
  if (!hasKey(currentCommitment, 'id')) {
    return currentCommitment
  }

  if (Object.hasOwn(patchValues, 'egcs_fc_commitment')) {
    const nextCommitment = await assertNextAgreementCommitmentEditable(event, db, agreementId, String(patchValues.egcs_fc_commitment))
    if (!hasKey(nextCommitment, 'id')) {
      return nextCommitment
    }
  }

  if (Object.hasOwn(patchValues, 'egcs_fc_transferpaymentstreamchartofaccount')) {
    const chartOfAccount = await assertChartOfAccountBelongsToAgreementStream(
      event,
      db,
      String(patchValues.egcs_fc_transferpaymentstreamchartofaccount),
      streamId
    )
    if (!hasKey(chartOfAccount, 'id')) {
      return chartOfAccount
    }
  }

  return {
    nextCommitmentId: String(patchValues.egcs_fc_commitment ?? existingLine.egcs_fc_commitment),
    nextChartOfAccountId: String(
      patchValues.egcs_fc_transferpaymentstreamchartofaccount ?? existingLine.egcs_fc_transferpaymentstreamchartofaccount
    )
  }
}

export const assertAgreementCommitmentTotalWithinProgramFunding = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  commitmentId: string,
  amount: Money,
  options: { excludeLineId?: string } = {}
) => {
  const commitment = await db
    .selectFrom('Funding_Case_Agreement_Commitment')
    .select('id')
    .where('id', '=', commitmentId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .forUpdate()
    .executeTakeFirst()

  if (!commitment) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  const budget = await db
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
    .select(
      databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_programfunding')}), 0)`).as('total')
    )
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .executeTakeFirst()

  let commitmentLineQuery = db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select(
      databaseMoneyText(sql`COALESCE(SUM(${sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')}), 0)`).as('total')
    )
    .where('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment', '=', commitmentId)
    .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)

  if (options.excludeLineId) {
    commitmentLineQuery = commitmentLineQuery.where('Funding_Case_Agreement_Commitment_Line.id', '!=', options.excludeLineId)
  }

  const commitmentLines = await commitmentLineQuery.executeTakeFirst()
  const programFundingTotal = parseDatabaseMoney(budget?.total ?? '0')
  const existingCommitmentTotal = parseDatabaseMoney(commitmentLines?.total ?? '0')

  if (compareMoney(addMoney(existingCommitmentTotal, amount), programFundingTotal) > 0) {
    return await badRequest(
      event,
      'AGREEMENT_COMMITMENT_EXCEEDS_PROGRAM_FUNDING',
      'apiErrors.agreement.commitment_exceeds_program_funding'
    )
  }

  return {
    programFundingTotal,
    existingCommitmentTotal
  }
}

const resolveAgreementCommitmentLinePatchAmount = (
  existingAmount: unknown,
  patchValues: FundingCaseAgreementCommitmentLinePatch
) => patchValues.egcs_fc_amount === undefined
  ? parseDatabaseMoney(existingAmount)
  : patchValues.egcs_fc_amount

const validateAgreementCommitmentLinePatchCapacity = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  lineId: string,
  currentCommitmentId: string,
  currentChartOfAccountId: string,
  nextCommitmentId: string,
  nextChartOfAccountId: string,
  nextAmount: Money
) => {
  const coverage = await getCommitmentLinePaymentCoverage(trx, lineId)
  if (coverage.hasActivePaymentLine
    && (nextCommitmentId !== currentCommitmentId || nextChartOfAccountId !== currentChartOfAccountId)) {
    return await throwApiError(event, {
      statusCode: 409,
      code: 'AGREEMENT_COMMITMENT_LINE_PAYMENT_CONTEXT_LOCKED',
      key: 'apiErrors.agreement.commitment_line_payment_context_locked'
    })
  }
  if (compareMoney(nextAmount, coverage.paidAmount) < 0) {
    return await badRequest(
      event,
      'AGREEMENT_COMMITMENT_LINE_BELOW_PAID_AMOUNT',
      'apiErrors.agreement.commitment_line_below_paid_amount'
    )
  }

  const budgetCapacity = await assertAgreementCommitmentTotalWithinProgramFunding(
    event,
    trx,
    agreementId,
    nextCommitmentId,
    nextAmount,
    { excludeLineId: lineId }
  )
  if (!hasKey(budgetCapacity, 'programFundingTotal')) {
    return budgetCapacity
  }

  return budgetCapacity
}

const syncAgreementCommitmentLinePatchStatuses = async (
  db: DbClient,
  currentCommitmentId: string,
  nextCommitmentId: string
) => {
  await syncAgreementCommitmentEditingStatus(db, currentCommitmentId)
  if (nextCommitmentId !== currentCommitmentId) {
    await syncAgreementCommitmentEditingStatus(db, nextCommitmentId)
  }
}

export const patchAgreementCommitmentLine = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  initialContext: AgreementScopeContext,
  lineId: string
) => {
  const patchValues = await readCommitmentLinePatchBody(event)

  try {
    return await executeAgreementCommitmentMutation(
      event,
      db,
      agreementId,
      initialContext,
      async trx => {
        const child = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line').select('egcs_fc_commitment').where('id', '=', lineId).where('_deleted', '=', false).executeTakeFirst()
        if (!child) return []
        return [
          { type: 'commitment', id: String(child.egcs_fc_commitment) },
          { type: 'commitment', id: String(patchValues.egcs_fc_commitment ?? child.egcs_fc_commitment) }
        ]
      },
      async (trx, currentContext) => {
        const existingLine = await assertAgreementCommitmentLineForAgreement(
          event,
          trx,
          agreementId,
          lineId,
          { lockCommitmentLine: true }
        )
        if (
          !hasKey(existingLine, 'egcs_fc_commitment')
          || !hasKey(existingLine, 'egcs_fc_transferpaymentstreamchartofaccount')
          || !hasKey(existingLine, 'egcs_fc_amount')
        ) {
          return existingLine
        }

        const references = await validateAgreementCommitmentLinePatchReferences(
          event,
          trx,
          agreementId,
          currentContext.streamId,
          existingLine,
          patchValues
        )
        if (!hasKey(references, 'nextCommitmentId') || !hasKey(references, 'nextChartOfAccountId')) {
          return references
        }

        const nextAmount = resolveAgreementCommitmentLinePatchAmount(existingLine.egcs_fc_amount, patchValues)
        const capacity = await validateAgreementCommitmentLinePatchCapacity(
          event,
          trx,
          agreementId,
          lineId,
          String(existingLine.egcs_fc_commitment),
          String(existingLine.egcs_fc_transferpaymentstreamchartofaccount),
          String(references.nextCommitmentId),
          String(references.nextChartOfAccountId),
          nextAmount
        )
        if (!hasKey(capacity, 'programFundingTotal')) {
          return capacity
        }

        const { egcs_fc_amount: patchedAmount, ...nonMoneyPatchValues } = patchValues
        const row = await trx
          .updateTable('Funding_Case_Agreement_Commitment_Line')
          .set({
            ...nonMoneyPatchValues,
            ...(patchedAmount === undefined
              ? {}
              : { egcs_fc_amount: databaseMoneyValue(patchedAmount) })
          })
          .where('id', '=', lineId)
          .where('egcs_fc_commitment', '=', String(existingLine.egcs_fc_commitment))
          .where('_deleted', '=', false)
          .returning([
            'id',
            'egcs_fc_commitment',
            'egcs_fc_commitmentlinenumber',
            'egcs_fc_transferpaymentstreamchartofaccount',
            databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
            '_deleted'
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementCommitmentLinePatchStatuses(
          trx,
          String(existingLine.egcs_fc_commitment),
          String(references.nextCommitmentId)
        )

        return { ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) }
      }
    )
  } catch (error: unknown) {
    await throwIfAgreementUniqueConstraintError(event, error)
    throw error
  }
}
