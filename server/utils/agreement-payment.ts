/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Temporary coverage while agreement payment helpers receive complete documentation. */
import { getRouterParam, type H3Event } from 'h3'
import { sql } from 'kysely'
import type { Kysely, Transaction } from 'kysely'
import { badRequest, forbidden } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import { authorizeAgreementResource } from '~~/server/utils/agreement'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { throwIfAgreementUniqueConstraintError } from '~~/server/utils/agreement-unique-constraint-errors'
import { executeFreshAuthorizedAgreementWrite } from '~~/server/utils/agreement-write-transaction'
import { runExtensionAgreementPaymentMutationGuards } from '~~/server/utils/extensions'
import { FundingCaseAgreementPaymentLinePatchSchema } from '~~/shared/types/schemas'
import type { AssignableEntityType, Database } from '~~/shared/types/database'
import type { FundingCaseAgreementPaymentLinePatch, FundingCaseAgreementPaymentPatch } from '~~/shared/types/schemas'
import type { AgreementScopeContext } from '~~/server/utils/agreement'
import { budgetFiscalYearStableId } from '~~/server/utils/agreement-budget-lineage'
import type { ExactEntityTarget } from '@gcs-ssc/authorization'
import { authorizeFreshAssignedItem } from '~~/server/utils/authorize'
import { assertBusinessStatusMutationAllowed, resolveBusinessStatusProtection } from '~~/server/utils/business-status-runtime'
import { getCommitmentLinePaymentCoverage } from '~~/server/utils/agreement-commitment-line-balance'
import { resolveLatestTargetApprovalEvidence } from '~~/server/utils/business-approval-evidence'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, compareMoney, type Money } from '~~/shared/utils/money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type DbClient = Kysely<Database> | Transaction<Database>
type AgreementPaymentPatchUpdateValues = Omit<FundingCaseAgreementPaymentPatch, 'egcs_fc_commitmenttype' | 'egcs_fc_paymentamount'> & {
  egcs_fc_paymentamount?: ReturnType<typeof databaseMoneyValue>
  egcs_fc_fundingagreementcommitment?: string
}

/** Internal retry signal when a payment line changes parents before its row lock is acquired. */
export class AgreementPaymentLineScopeChanged extends Error {}

const hasKey = <TKey extends string>(
  value: unknown,
  key: TKey
): value is Record<TKey, unknown> => value !== null && typeof value === 'object' && key in value

/** Validates the agreement route id, enforces scoped access, and returns its stream context. */
export const prepareAgreementPaymentRoute = async (
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

export type AgreementPaymentRuntimeContext = {
  paymentId: string
  commitmentId: string
  agreementId: string
  streamId: string
  agencyId: string
}

/** Loads a payment with the agreement and stream scope needed by runtime actions. */
export const resolveAgreementPaymentRuntimeContext = async (
  db: DbClient,
  paymentId: string
): Promise<AgreementPaymentRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(paymentId)) return null
  const row = await db
    .selectFrom('Funding_Case_Agreement_Payment')
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
    )
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
      'Funding_Case_Agreement_Payment.id as payment_id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment as commitment_id',
      'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as agreement_id',
      'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Payment.id', '=', paymentId)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()

  if (!row?.payment_id || !row.commitment_id || !row.agreement_id || !row.stream_id || !row.agency_id) {
    return null
  }

  return {
    paymentId: String(row.payment_id),
    commitmentId: String(row.commitment_id),
    agreementId: String(row.agreement_id),
    streamId: String(row.stream_id),
    agencyId: String(row.agency_id)
  }
}

/** Loads an active payment scoped to the specified agreement. */
export const getAgreementPayment = async (
  db: DbClient,
  agreementId: string,
  paymentId: string,
  options: { lockPayment?: boolean } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Payment')
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
    )
    .select([
      'Funding_Case_Agreement_Payment.id as id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment as egcs_fc_fundingagreementcommitment',
      'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear as egcs_fc_fiscalyear',
      'Funding_Case_Agreement_Payment.egcs_fc_paymenttype as egcs_fc_paymenttype',
      'Funding_Case_Agreement_Payment.egcs_fc_periodstart as egcs_fc_periodstart',
      'Funding_Case_Agreement_Payment.egcs_fc_periodend as egcs_fc_periodend',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('egcs_fc_paymentamount'),
      'Funding_Case_Agreement_Payment.egcs_fc_currency as egcs_fc_currency',
      'Funding_Case_Agreement_Payment.egcs_fc_comment as egcs_fc_comment',
      'Funding_Case_Agreement_Payment.egcs_fc_status as egcs_fc_status'
    ])
    .where('Funding_Case_Agreement_Payment.id', '=', paymentId)
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
  if (options.lockPayment === true) {
    query = query.forUpdate('Funding_Case_Agreement_Payment')
  }

  const payment = await query.executeTakeFirst()
  return payment
    ? { ...payment, egcs_fc_paymentamount: parseDatabaseMoney(payment.egcs_fc_paymentamount) }
    : undefined
}

/** Rejects changes to a payment once it has left the editable lifecycle state. */
export const assertAgreementPaymentEditable = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  paymentId: string,
  options: { lockPayment?: boolean } = {}
) => {
  const payment = await getAgreementPayment(db, agreementId, paymentId, options)

  if (!payment) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  const protection = await resolveBusinessStatusProtection(db, 'fundingcasepayment', paymentId)
  if (!protection || protection.locked) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_LOCKED', 'apiErrors.request.invalid_status')
  }

  return payment
}

/** Recomputes and persists whether a payment remains editable. */
export const syncAgreementPaymentEditingStatus = async (
  _db: Transaction<Database>,
  _paymentId: string,
  _context: {
    event: H3Event
    agreementId: string
  }
) => {
  // Ordinary payment edits preserve the Agency-configured business status.
}

/** Maps a payment patch to database fields without overwriting omitted values. */
export const buildAgreementPaymentPatchUpdateValues = (
  patchValues: FundingCaseAgreementPaymentPatch,
  nextCommitmentId?: string
): AgreementPaymentPatchUpdateValues => {
  const {
    egcs_fc_commitmenttype: _commitmentType,
    egcs_fc_paymentamount: paymentAmount,
    ...paymentPatchValues
  } = patchValues
  const updateValues: AgreementPaymentPatchUpdateValues = { ...paymentPatchValues }

  if (paymentAmount !== undefined) {
    updateValues.egcs_fc_paymentamount = databaseMoneyValue(paymentAmount)
  }

  if (nextCommitmentId !== undefined) {
    updateValues.egcs_fc_fundingagreementcommitment = nextCommitmentId
  }

  return updateValues
}

/** Detects whether a payment patch changes the commitment or fiscal-year line context. */
export const agreementPaymentPatchChangesLineContext = (
  existingPayment: {
    egcs_fc_fundingagreementcommitment: string | number
    egcs_fc_fiscalyear: string | number
  },
  patchValues: FundingCaseAgreementPaymentPatch,
  nextCommitmentId?: string
): boolean => {
  const changesCommitment = nextCommitmentId !== undefined
    && nextCommitmentId !== String(existingPayment.egcs_fc_fundingagreementcommitment)
  const changesFiscalYear = Object.hasOwn(patchValues, 'egcs_fc_fiscalyear')
    && String(patchValues.egcs_fc_fiscalyear) !== String(existingPayment.egcs_fc_fiscalyear)

  return changesCommitment || changesFiscalYear
}

/** Resolves the patch's commitment reference, including type-based commitment lookup. */
export const resolveAgreementPaymentPatchCommitmentId = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  patchValues: FundingCaseAgreementPaymentPatch
): Promise<{
  response?: unknown
  nextCommitmentId?: string
}> => {
  if (!patchValues.egcs_fc_commitmenttype) {
    return {}
  }

  const resolvedCommitment = await resolveActiveAgreementPaymentCommitmentByType(
    event,
    db,
    agreementId,
    patchValues.egcs_fc_commitmenttype
  )
  if (!('id' in resolvedCommitment)) {
    return { response: resolvedCommitment }
  }

  return { nextCommitmentId: String(resolvedCommitment.id) }
}

/** Prevents changing a payment's commitment or fiscal year after lines have been added. */
export const assertAgreementPaymentHasNoLinesForContextChange = async (
  event: H3Event,
  db: DbClient,
  paymentId: string,
  options: { lockPaymentLines?: boolean } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .select('id')
    .where('egcs_fc_fundingagreementpayment', '=', paymentId)
    .where('_deleted', '=', false)

  if (options.lockPaymentLines === true) {
    query = query.forUpdate()
  }

  const existingLine = await query.executeTakeFirst()

  if (existingLine) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_LINES_EXIST', 'apiErrors.request.invalid_status')
  }

  return null
}

/** Validates commitment and fiscal-year changes before a payment patch is applied. */
export const validateAgreementPaymentPatchContext = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  paymentId: string,
  existingPayment: {
    egcs_fc_fundingagreementcommitment: string | number
    egcs_fc_fiscalyear: string | number
  },
  patchValues: FundingCaseAgreementPaymentPatch,
  updateValues: AgreementPaymentPatchUpdateValues,
  nextCommitmentId?: string,
  options: { lockPaymentLines?: boolean } = {}
) => {
  if (agreementPaymentPatchChangesLineContext(existingPayment, patchValues, nextCommitmentId)) {
    const lineGuard = await assertAgreementPaymentHasNoLinesForContextChange(event, db, paymentId, options)
    if (lineGuard) {
      return lineGuard
    }
  }

  if (Object.hasOwn(updateValues, 'egcs_fc_fiscalyear')) {
    const fiscalYear = await assertAgreementPaymentFiscalYear(event, db, agreementId, String(updateValues.egcs_fc_fiscalyear))
    if (!fiscalYear || typeof fiscalYear !== 'object' || !('id' in fiscalYear)) {
      return fiscalYear
    }
  }

  return null
}

/** Projects payment editability and optional commitment changes into response fields. */
export const normalizeAgreementPaymentEditingResponse = <T extends {
  egcs_fc_status: Database['Funding_Case_Agreement_Payment']['egcs_fc_status']
}>(payment: T): T => payment

/** Ensures the selected commitment belongs to the payment's agreement and stream. */
export const assertAgreementPaymentCommitment = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  commitmentId: string
) => {
  const commitment = await db
    .selectFrom('Funding_Case_Agreement_Commitment')
    .select(['id', 'egcs_fc_status', 'egcs_fc_active'])
    .where('id', '=', commitmentId)
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  if (!commitment) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_NOT_FOUND', 'apiErrors.agreement.commitment_not_found')
  }

  const completion = await db.selectFrom('Common_Completion').select('id')
    .where('egcs_cn_entitytype', '=', 'fundingcaseagreementcommitment')
    .where('egcs_cn_entityid', '=', commitmentId).where('_deleted', '=', false).executeTakeFirst()
  const approval = await resolveLatestTargetApprovalEvidence(db, 'fundingcaseagreementcommitment', commitmentId)
  const isEligibleCommitment = commitment.egcs_fc_active === true
    && (Boolean(completion) || approval?.approvalRuntimeState === 'approved')
  if (!isEligibleCommitment) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_INVALID_COMMITMENT', 'apiErrors.agreement.invalid_payment_commitment')
  }

  return commitment
}

/** Finds the active editable commitment of a requested type for the payment's stream. */
export const resolveActiveAgreementPaymentCommitmentByType = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  commitmentType: string
) => {
  const commitments = await db
    .selectFrom('Funding_Case_Agreement_Commitment')
    .select(['id', 'egcs_fc_status', 'egcs_fc_active', 'egcs_fc_type'])
    .where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_type', '=', commitmentType)
    .where('egcs_fc_active', '=', true)
    .where('_deleted', '=', false)
    .execute()

  let commitment = null
  for (const candidate of commitments) {
    const completion = await db.selectFrom('Common_Completion').select('id')
      .where('egcs_cn_entitytype', '=', 'fundingcaseagreementcommitment')
      .where('egcs_cn_entityid', '=', String(candidate.id)).where('_deleted', '=', false).executeTakeFirst()
    const approval = await resolveLatestTargetApprovalEvidence(db, 'fundingcaseagreementcommitment', String(candidate.id))
    if (completion || approval?.approvalRuntimeState === 'approved') {
      commitment = candidate
      break
    }
  }

  if (!commitment) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_INVALID_COMMITMENT', 'apiErrors.agreement.invalid_payment_commitment')
  }

  return commitment
}

/** Ensures the selected fiscal year belongs to the agreement's agency. */
export const assertAgreementPaymentFiscalYear = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  fiscalYearId: string
) => {
  const fiscalYear = await db
    .selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .select(budgetFiscalYearStableId.as('id'))
    .where(budgetFiscalYearStableId, '=', fiscalYearId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .executeTakeFirst()

  if (!fiscalYear) {
    return await badRequest(event, 'INVALID_AGREEMENT_PAYMENT_FISCAL_YEAR', 'apiErrors.agreement.invalid_payment_fiscal_year')
  }

  return fiscalYear
}

/** Ensures a payment line references a commitment line in the payment's commitment. */
export const assertAgreementPaymentCommitmentLine = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  paymentId: string,
  commitmentLineId: string
) => {
  const payment = await getAgreementPayment(db, agreementId, paymentId)
  if (!payment) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  }

  const line = await db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .innerJoin(
      'Transfer_Payment_Stream_Chart_of_Account',
      'Transfer_Payment_Stream_Chart_of_Account.id',
      'Funding_Case_Agreement_Commitment_Line.egcs_fc_transferpaymentstreamchartofaccount'
    )
    .innerJoin(
      'Transfer_Payment_Stream_Budget',
      'Transfer_Payment_Stream_Budget.id',
      'Transfer_Payment_Stream_Chart_of_Account.egcs_tp_streambudget'
    )
    .innerJoin(
      'Transfer_Payment_Fiscal_Year_Budget',
      'Transfer_Payment_Fiscal_Year_Budget.id',
      'Transfer_Payment_Stream_Budget.egcs_tp_transferpaymentbudget'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Fiscal_Year',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear',
      'Transfer_Payment_Fiscal_Year_Budget.egcs_tp_fiscalyear'
    )
    .innerJoin(
      'Funding_Case_Agreement_Budget_Version',
      'Funding_Case_Agreement_Budget_Version.id',
      'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_budgetversion'
    )
    .select([
      'Funding_Case_Agreement_Commitment_Line.id as id',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Commitment_Line.egcs_fc_amount')).as('amount')
    ])
    .where('Funding_Case_Agreement_Commitment_Line.id', '=', commitmentLineId)
    .where('Funding_Case_Agreement_Commitment_Line.egcs_fc_commitment', '=', payment.egcs_fc_fundingagreementcommitment)
    .where(budgetFiscalYearStableId, '=', payment.egcs_fc_fiscalyear)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Commitment_Line._deleted', '=', false)
    .where('Transfer_Payment_Stream_Chart_of_Account._deleted', '=', false)
    .where('Transfer_Payment_Stream_Budget._deleted', '=', false)
    .where('Transfer_Payment_Fiscal_Year_Budget._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .where('Funding_Case_Agreement_Budget_Version.egcs_fc_iscurrent', '=', true)
    .where('Funding_Case_Agreement_Budget_Version._deleted', '=', false)
    .executeTakeFirst()

  if (!line) {
    return await badRequest(event, 'INVALID_AGREEMENT_PAYMENT_COMMITMENT_LINE', 'apiErrors.agreement.invalid_payment_commitment_line')
  }

  return { ...line, amount: parseDatabaseMoney(line.amount) }
}

/** Rejects a payment line amount that exceeds the commitment line's unpaid balance. */
export const assertPaymentLineWithinCommitmentBalance = async (
  event: H3Event,
  db: DbClient,
  commitmentLineId: string,
  amount: Money,
  excludePaymentLineId?: string,
  options: { lockCommitmentLine?: boolean } = {}
) => {
  let lineQuery = db
    .selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select([
      'id',
      databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount')
    ])
    .where('id', '=', commitmentLineId)
    .where('_deleted', '=', false)

  if (options.lockCommitmentLine === true) {
    lineQuery = lineQuery.forUpdate()
  }

  const line = await lineQuery
    .executeTakeFirst()

  if (!line) {
    return await badRequest(event, 'AGREEMENT_COMMITMENT_LINE_NOT_FOUND', 'apiErrors.agreement.commitment_line_not_found')
  }

  const { paidAmount } = await getCommitmentLinePaymentCoverage(db, commitmentLineId, { excludePaymentLineId })
  const commitmentLineAmount = parseDatabaseMoney(line.egcs_fc_amount)
  if (compareMoney(addMoney(paidAmount, amount), commitmentLineAmount) > 0) {
    return await badRequest(event, 'AGREEMENT_PAYMENT_EXCEEDS_COMMITMENT_BALANCE', 'apiErrors.agreement.payment_exceeds_commitment_balance')
  }

  return {
    commitmentLineAmount,
    paidAmount
  }
}

const readAgreementPaymentLinePatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, FundingCaseAgreementPaymentLinePatchSchema)
}

/** Ensures the requested payment line belongs to the specified agreement. */
export const assertAgreementPaymentLineForAgreement = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  lineId: string,
  options: { lockPaymentLine?: boolean } = {}
) => {
  let query = db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .innerJoin(
      'Funding_Case_Agreement_Payment',
      'Funding_Case_Agreement_Payment.id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment'
    )
    .innerJoin(
      'Funding_Case_Agreement_Commitment',
      'Funding_Case_Agreement_Commitment.id',
      'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment'
    )
    .where('Funding_Case_Agreement_Payment_Line.id', '=', lineId)
    .where('Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Payment_Line._deleted', '=', false)
    .where('Funding_Case_Agreement_Payment._deleted', '=', false)
    .where('Funding_Case_Agreement_Commitment._deleted', '=', false)
    .select([
      'Funding_Case_Agreement_Payment_Line.id as id',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementpayment as egcs_fc_fundingagreementpayment',
      'Funding_Case_Agreement_Payment_Line.egcs_fc_fundingagreementcommitmentline as egcs_fc_fundingagreementcommitmentline',
      databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment_Line.egcs_fc_amount')).as('egcs_fc_amount')
    ])

  if (options.lockPaymentLine === true) {
    query = query.forUpdate('Funding_Case_Agreement_Payment_Line')
  }

  return await assertAgreementChildExists(
    event,
    query.executeTakeFirst(),
    ...AGREEMENT_CHILD_ERROR_KEYS.paymentLineNotFound
  )
}

/** Locks all candidate payment parents in id order before locking their child payment line. */
export const lockAgreementPaymentLineForMutation = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  lineId: string,
  additionalPaymentIds: string[] = []
) => {
  const resolvedLine = await assertAgreementPaymentLineForAgreement(event, trx, agreementId, lineId)
  if (!hasKey(resolvedLine, 'egcs_fc_fundingagreementpayment')) {
    return resolvedLine
  }

  const resolvedPaymentId = String(resolvedLine.egcs_fc_fundingagreementpayment)
  const paymentIds = [...new Set([resolvedPaymentId, ...additionalPaymentIds])]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  for (const paymentId of paymentIds) {
    const editablePayment = await assertAgreementPaymentEditable(event, trx, agreementId, paymentId, {
      lockPayment: true
    })
    if (!hasKey(editablePayment, 'id')) {
      return editablePayment
    }
  }

  const lockedLine = await assertAgreementPaymentLineForAgreement(event, trx, agreementId, lineId, {
    lockPaymentLine: true
  })
  if (!hasKey(lockedLine, 'egcs_fc_fundingagreementpayment')) {
    return lockedLine
  }
  if (String(lockedLine.egcs_fc_fundingagreementpayment) !== resolvedPaymentId) {
    throw new AgreementPaymentLineScopeChanged()
  }

  return lockedLine
}

/** Loads a payment line with its payment and agreement ownership identifiers. */
const resolveAgreementPaymentLinePatchTarget = async (
  event: H3Event,
  db: DbClient,
  agreementId: string,
  existingLine: Record<'egcs_fc_fundingagreementpayment' | 'egcs_fc_fundingagreementcommitmentline' | 'egcs_fc_amount', unknown>,
  patchValues: FundingCaseAgreementPaymentLinePatch
) => {
  const editablePayment = await assertAgreementPaymentEditable(
    event,
    db,
    agreementId,
    String(existingLine.egcs_fc_fundingagreementpayment),
    { lockPayment: true }
  )
  if (!hasKey(editablePayment, 'id')) {
    return editablePayment
  }

  const nextPaymentId = patchValues.egcs_fc_fundingagreementpayment
    ? String(patchValues.egcs_fc_fundingagreementpayment)
    : String(existingLine.egcs_fc_fundingagreementpayment)

  if (nextPaymentId !== String(existingLine.egcs_fc_fundingagreementpayment)) {
    const nextEditablePayment = await assertAgreementPaymentEditable(
      event,
      db,
      agreementId,
      nextPaymentId,
      { lockPayment: true }
    )
    if (!hasKey(nextEditablePayment, 'id')) {
      return nextEditablePayment
    }
  }

  return {
    nextPaymentId,
    nextCommitmentLineId: patchValues.egcs_fc_fundingagreementcommitmentline
      ? String(patchValues.egcs_fc_fundingagreementcommitmentline)
      : String(existingLine.egcs_fc_fundingagreementcommitmentline),
    nextAmount: patchValues.egcs_fc_amount === undefined
      ? parseDatabaseMoney(existingLine.egcs_fc_amount)
      : patchValues.egcs_fc_amount
  }
}

/** Ensures an updated payment amount remains within the commitment line balance. */
const validateAgreementPaymentLinePatchBalance = async (
  event: H3Event,
  trx: Transaction<Database>,
  agreementId: string,
  lineId: string,
  nextPaymentId: string,
  nextCommitmentLineId: string,
  nextAmount: Money
) => {
  const commitmentLine = await assertAgreementPaymentCommitmentLine(event, trx, agreementId, nextPaymentId, nextCommitmentLineId)
  if (!hasKey(commitmentLine, 'id')) {
    return commitmentLine
  }

  const balance = await assertPaymentLineWithinCommitmentBalance(
    event,
    trx,
    nextCommitmentLineId,
    nextAmount,
    lineId,
    { lockCommitmentLine: true }
  )
  if (!hasKey(balance, 'paidAmount')) {
    return balance
  }

  return balance
}

const syncAgreementPaymentLinePatchStatuses = async (
  db: Transaction<Database>,
  event: H3Event,
  agreementId: string,
  currentPaymentId: string,
  nextPaymentId: string
) => {
  await syncAgreementPaymentEditingStatus(db, currentPaymentId, { event, agreementId })
  if (nextPaymentId !== currentPaymentId) {
    await syncAgreementPaymentEditingStatus(db, nextPaymentId, { event, agreementId })
  }
}

/** Patches a payment line after validating ownership and remaining commitment balance. */
export const patchAgreementPaymentLine = async (
  event: H3Event,
  db: Kysely<Database>,
  agreementId: string,
  agreementContext: AgreementScopeContext,
  lineId: string
) => {
  const patchValues = await readAgreementPaymentLinePatchBody(event)
  const requestedPaymentIds: string[] = []
  if (patchValues.egcs_fc_fundingagreementpayment !== undefined) {
    requestedPaymentIds.push(String(patchValues.egcs_fc_fundingagreementpayment))
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executeFreshAuthorizedAgreementWrite(event, db, agreementId, agreementContext, async trx => {
        const existingLine = await lockAgreementPaymentLineForMutation(
          event,
          trx,
          agreementId,
          lineId,
          requestedPaymentIds
        )
        if (
          !hasKey(existingLine, 'egcs_fc_fundingagreementpayment')
          || !hasKey(existingLine, 'egcs_fc_fundingagreementcommitmentline')
          || !hasKey(existingLine, 'egcs_fc_amount')
        ) {
          return existingLine
        }

        const target = await resolveAgreementPaymentLinePatchTarget(event, trx, agreementId, existingLine, patchValues)
        if (!hasKey(target, 'nextPaymentId') || !hasKey(target, 'nextCommitmentLineId') || !hasKey(target, 'nextAmount')) {
          return target
        }

        await runExtensionAgreementPaymentMutationGuards(event, trx, {
          operation: 'payment-line.update',
          agreementId,
          paymentId: String(existingLine.egcs_fc_fundingagreementpayment),
          paymentLineId: lineId,
          changes: patchValues
        })

        const balance = await validateAgreementPaymentLinePatchBalance(
          event,
          trx,
          agreementId,
          lineId,
          String(target.nextPaymentId),
          String(target.nextCommitmentLineId),
          target.nextAmount as Money
        )
        if (!hasKey(balance, 'paidAmount')) {
          return balance
        }

        const { egcs_fc_amount: patchedAmount, ...nonMoneyPatchValues } = patchValues
        const row = await trx
          .updateTable('Funding_Case_Agreement_Payment_Line')
          .set({
            ...nonMoneyPatchValues,
            ...(patchedAmount === undefined ? {} : { egcs_fc_amount: databaseMoneyValue(patchedAmount) })
          })
          .where('id', '=', lineId)
          .where('_deleted', '=', false)
          .returning([
            'id',
            'egcs_fc_fundingagreementpayment',
            'egcs_fc_fundingagreementcommitmentline',
            databaseMoneyText(sql.ref('egcs_fc_amount')).as('egcs_fc_amount'),
            '_deleted'
          ])
          .executeTakeFirstOrThrow()

        await syncAgreementPaymentLinePatchStatuses(
          trx,
          event,
          agreementId,
          String(existingLine.egcs_fc_fundingagreementpayment),
          String(target.nextPaymentId)
        )

        return { ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount) }
      }, {
        authorize: async (trx, _currentContext, authContext) => {
          const line = await lockAgreementPaymentLineForMutation(
            event,
            trx,
            agreementId,
            lineId,
            requestedPaymentIds
          )
          if (!hasKey(line, 'egcs_fc_fundingagreementpayment')) return await forbidden(event)

          const paymentIds = new Set([
            String(line.egcs_fc_fundingagreementpayment),
            ...requestedPaymentIds
          ])
          for (const paymentId of [...paymentIds].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))) {
            await assertBusinessStatusMutationAllowed(event, trx, 'fundingcasepayment', paymentId)
            await authorizeFreshAssignedItem(event, trx, authContext, 'fundingcasepayment', paymentId)
          }
        }
      })
    } catch (error: unknown) {
      if (error instanceof AgreementPaymentLineScopeChanged) {
        if (attempt < 2) continue
        return await badRequest(event, 'AGREEMENT_PAYMENT_LINE_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
      }
      await throwIfAgreementUniqueConstraintError(event, error)
      throw error
    }
  }

  return await badRequest(event, 'AGREEMENT_PAYMENT_LINE_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
}

/** Totals active line amounts for a payment. */
export const getPaymentLineTotal = async (
  db: DbClient,
  paymentId: string
) => {
  const row = await db
    .selectFrom('Funding_Case_Agreement_Payment_Line')
    .select(databaseMoneyText(sql`COALESCE(SUM(${sql.ref('egcs_fc_amount')}), 0)`).as('total'))
    .where('egcs_fc_fundingagreementpayment', '=', paymentId)
    .where('_deleted', '=', false)
    .executeTakeFirst()

  return parseDatabaseMoney(row?.total ?? '0')
}

/** Compares active payment-line totals to the payment amount exactly. */
export const paymentLineTotalMatchesPaymentAmount = async (
  db: DbClient,
  paymentId: string
): Promise<boolean> => {
  const payment = await db
    .selectFrom('Funding_Case_Agreement_Payment')
    .select(databaseMoneyText(sql.ref('egcs_fc_paymentamount')).as('egcs_fc_paymentamount'))
    .where('id', '=', paymentId)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!payment) return false

  return compareMoney(
    await getPaymentLineTotal(db, paymentId),
    parseDatabaseMoney(payment.egcs_fc_paymentamount)
  ) === 0
}
