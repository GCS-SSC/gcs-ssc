/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Domain helpers expose explicit accounting and authorization contracts. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { JournalVoucherCreate, JournalVoucherEdit } from '~~/shared/types/schemas/journal-voucher'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { generateJournalVoucherAdjustments, reverseJournalVoucherAllocations, JournalVoucherAccountingError, type JournalVoucherAccountingLine } from '~~/shared/utils/journal-voucher'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { resolveJournalVoucherRuntimeContext } from './journal-voucher-context'
import { authorize, requireAuthContext } from './authorize'
import { forbidden, notFound, throwApiError } from './api-errors'
import { resolveAgreementScopeContext } from './agreement'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus, resolveBusinessStatusProtection } from './business-status-runtime'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { resolveAssignedItemTargetGrant } from './rbac'
import { withBusinessRecordState } from './business-record-state'
import { journalVoucherPaymentIsFinal } from './journal-voucher-source'

export const journalVoucherError = async (event: H3Event, code: string) => await throwApiError(event, {
  statusCode: 409, code, key: 'apiErrors.journal_voucher.invalid_entry'
})

export const authorizeJournalVoucher = async (event: H3Event, journalVoucherId: string, action: 'read' | 'update' | 'delete' = 'read') => {
  const context = await resolveJournalVoucherRuntimeContext(event.context.$db, journalVoucherId)
  if (!context) return await notFound(event, 'JOURNAL_VOUCHER_NOT_FOUND', 'apiErrors.journal_voucher.not_found')
  await authorize(event, 'journal_voucher', action, context.scope)
  return context
}

export const readJournalVoucherLines = async (db: Kysely<Database>, journalVoucherId: string) => {
  const rows = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher_Line as line')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .select(['line.id', 'line.egcs_fc_kind', 'line.egcs_fc_commitmentline', 'line.egcs_fc_commitmentlinenumber', 'line.egcs_fc_chartofaccount', 'line.egcs_fc_accountingdimensions',
      'coding.egcs_tp_agencychartofaccount as egcs_fc_agencychartofaccount',
      databaseMoneyText(sql.ref('line.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('line.egcs_fc_journalvoucher', '=', journalVoucherId).where('line._deleted', '=', false)
    .orderBy('line.egcs_fc_commitmentlinenumber').orderBy('line.id').execute()
  return rows.map(row => ({ ...row,
    egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(row.egcs_fc_accountingdimensions)
  }))
}

export const persistJournalVoucherLines = async (trx: Transaction<Database>, id: string, paymentId: string,
  kind: 'original' | 'corrected' | 'adjustment', lines: JournalVoucherAccountingLine[]) => {
  if (!lines.length) return
  await trx.insertInto('Funding_Case_Agreement_Journal_Voucher_Line').values(lines.map(line => ({
    egcs_fc_journalvoucher: id, egcs_fc_payment: paymentId, egcs_fc_kind: kind,
    egcs_fc_commitmentline: line.egcs_fc_commitmentline, egcs_fc_commitmentlinenumber: line.egcs_fc_commitmentlinenumber,
    egcs_fc_chartofaccount: line.egcs_fc_chartofaccount,
    egcs_fc_accountingdimensions: sql`${JSON.stringify(line.egcs_fc_accountingdimensions)}::jsonb`,
    egcs_fc_amount: databaseMoneyValue(line.egcs_fc_amount)
  }))).execute()
}

/** Retains all source coding and bilingual department-defined dimensions in ordinary JV rows. */
const readPaymentAllocations = async (trx: Transaction<Database>, paymentId: string): Promise<JournalVoucherAccountingLine[]> => {
  const rows = await trx.selectFrom('Funding_Case_Agreement_Payment_Line as l')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as c', 'c.id', 'l.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as s', 's.id', 'c.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as a', 'a.id', 's.egcs_tp_agencychartofaccount')
    .select(['c.id as egcs_fc_commitmentline', 'c.egcs_fc_commitmentlinenumber', 's.id as egcs_fc_chartofaccount',
      'a.egcs_ay_accountingdimensions as egcs_fc_accountingdimensions', databaseMoneyText(sql.ref('l.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('l.egcs_fc_fundingagreementpayment', '=', paymentId).where('l._deleted', '=', false)
    .orderBy('c.id').forShare('l').execute()
  return rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(row.egcs_fc_accountingdimensions) }))
}

/** Agency/Stream/fiscal-year choices are authorized by the JV root, without a Program read grant. */
export const readJournalVoucherCodingChoices = async (db: Kysely<Database>, context: NonNullable<Awaited<ReturnType<typeof resolveJournalVoucherRuntimeContext>>>, fiscalYearId: string) =>
  await db.selectFrom('Transfer_Payment_Stream_Chart_of_Account as s')
    .innerJoin('Agency_Chart_of_Account as a', 'a.id', 's.egcs_tp_agencychartofaccount')
    .select(['s.id', 'a.egcs_ay_accountingdimensions', 's.egcs_tp_agencychartofaccount'])
    .where('s.egcs_tp_transferpaymentstream', '=', context.streamId)
    .where('a.egcs_ay_organizationagency', '=', context.agencyId).where('a.egcs_ay_fiscalyear', '=', fiscalYearId)
    .where('s._deleted', '=', false).where('a._deleted', '=', false).orderBy('s.id').execute()

/** Matches actual coding identities, independently of operational commitment line numbers. */
export const readJournalVoucherAgreementCoding = async (db: Kysely<Database>, agreementId: string) => {
  const rows = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'line.egcs_fc_commitment')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .select('coding.egcs_tp_agencychartofaccount')
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId)
    .where('commitment._deleted', '=', false).where('line._deleted', '=', false).execute()
  return new Set(rows.map(row => String(row.egcs_tp_agencychartofaccount)))
}

/** Resolved negative submissions may be superseded while their retained accounting stays frozen. */
export const hasNegativeJournalVoucherCompletion = async (db: Kysely<Database>, id: string): Promise<boolean> => {
  const latest = await db.selectFrom('Common_Completion as completion')
    .innerJoin('Common_Workflow_Run as run', 'run.egcs_cn_completion', 'completion.id')
    .innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id')
    .select('runtime.egcs_cn_state').where('completion.egcs_cn_entitytype', '=', 'fundingcasejournalvoucher')
    .where('completion.egcs_cn_entityid', '=', id).where('completion._deleted', '=', false)
    .where('runtime._deleted', '=', false).orderBy('runtime.egcs_cn_attempt', 'desc').executeTakeFirst()
  return latest !== undefined && ['unsuccessful', 'denied', 'cancelled', 'failed'].includes(latest.egcs_cn_state)
}

/** Agreement lock serializes all correction/reversal/replacement sequences for a Payment. */
const assertJournalVoucherSequence = async (event: H3Event, trx: Transaction<Database>, paymentId: string,
  options: { replacementOf?: string; reversalOf?: string }) => {
  await trx.selectFrom('Funding_Case_Agreement_Payment').select('id').where('id', '=', paymentId).forUpdate().executeTakeFirstOrThrow()
  const entries = await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher').selectAll()
    .where('egcs_fc_payment', '=', paymentId).where('_deleted', '=', false).orderBy('egcs_fc_number').forUpdate().execute()
  const latest = entries.at(-1)
  if (options.reversalOf) {
    if (!latest || String(latest.id) !== options.reversalOf || latest.egcs_fc_reversalof
      || !await hasPositiveCompletionTerminus(trx, 'fundingcasejournalvoucher', options.reversalOf)) return await journalVoucherError(event, 'JV_REVERSAL_SEQUENCE')
    return
  }
  if (!latest) {
    if (options.replacementOf) return await journalVoucherError(event, 'JV_REPLACEMENT_SEQUENCE')
    return
  }
  if (options.replacementOf !== String(latest.id) || !(
    (latest.egcs_fc_reversalof && await hasPositiveCompletionTerminus(trx, 'fundingcasejournalvoucher', String(latest.id)))
    || (!latest.egcs_fc_reversalof && await hasNegativeJournalVoucherCompletion(trx, String(latest.id)))
  )) return await journalVoucherError(event, 'JV_REPLACEMENT_SEQUENCE')
}

export const createJournalVoucher = async (event: H3Event, input: JournalVoucherCreate,
  options: { reversalOf?: string } = {}) => {
  const db = event.context.$db
  const payment = await db.selectFrom('Funding_Case_Agreement_Payment').select(['id', 'egcs_fc_fundingagreement'])
    .where('id', '=', input.egcs_fc_payment).where('_deleted', '=', false).executeTakeFirst()
  const initial = payment ? await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), db) : null
  if (!initial) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  await authorize(event, 'journal_voucher', 'create', initial.scope)
  if (options.reversalOf) await authorizeJournalVoucher(event, options.reversalOf)
  else await authorize(event, 'agreement', 'read', initial.scope)
  return await executeFreshAuthorizedAgreementWrite(event, db, initial.agreementId, initial, async (trx, context, auth) => {
    await assertJournalVoucherSequence(event, trx, input.egcs_fc_payment, { replacementOf: input.egcs_fc_replacementof, reversalOf: options.reversalOf })
    const source = await trx.selectFrom('Funding_Case_Agreement_Payment as p')
      .innerJoin('Common_Status as status', 'status.id', 'p.egcs_fc_status')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as fy', 'fy.id', 'p.egcs_fc_fiscalyear')
      .innerJoin('Agency_Fiscal_Year as ay', 'ay.id', 'fy.egcs_fc_fiscalyear')
      .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'p.egcs_fc_fundingagreement')
      .select(['p.egcs_fc_currency', 'p.egcs_fc_fiscalyear', 'fy.egcs_fc_fiscalyear as agencyFiscalYear', 'ay.egcs_ay_fiscalyeardisplay',
        'agreement.egcs_fc_agreementnumber', journalVoucherPaymentIsFinal('p').as('isFinal')])
      .where('p.id', '=', input.egcs_fc_payment).where('p._deleted', '=', false).where('status._deleted', '=', false).forShare('p').executeTakeFirstOrThrow()
    if (!source.isFinal) return await journalVoucherError(event, 'JV_PAYMENT_NOT_FINAL')
    const commonUserId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!commonUserId) return await forbidden(event)
    const numberRow = await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher')
      .select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum')).where('egcs_fc_fundingagreement', '=', context.agreementId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Agreement_Journal_Voucher').values({
      egcs_fc_fundingagreement: context.agreementId, egcs_fc_payment: input.egcs_fc_payment,
      egcs_fc_fiscalyear: source.egcs_fc_fiscalyear, egcs_fc_agencyfiscalyear: source.agencyFiscalYear,
      egcs_fc_currency: source.egcs_fc_currency, egcs_fc_number: Number(numberRow.maximum ?? 0) + 1,
      egcs_fc_agreementnumber: source.egcs_fc_agreementnumber, egcs_fc_fiscalyeardisplay: source.egcs_ay_fiscalyeardisplay,
      egcs_fc_requesteddate: sql<Date>`${input.egcs_fc_requesteddate.toISOString().slice(0, 10)}::date`,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr,
      egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId),
      egcs_fc_reversalof: options.reversalOf ?? null, egcs_fc_replacementof: input.egcs_fc_replacementof ?? null
    }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcasejournalvoucher', String(created.id), commonUserId)
    const previous = options.reversalOf ? await readJournalVoucherLines(trx, options.reversalOf) : null
    const replacementNegative = input.egcs_fc_replacementof ? await hasNegativeJournalVoucherCompletion(trx, input.egcs_fc_replacementof) : false
    const allocations = previous
      ? reverseJournalVoucherAllocations(previous.filter(line => line.egcs_fc_kind === 'original'), previous.filter(line => line.egcs_fc_kind === 'corrected'))
      : { original: input.egcs_fc_replacementof
          ? (await readJournalVoucherLines(trx, input.egcs_fc_replacementof)).filter(line => line.egcs_fc_kind === (replacementNegative ? 'original' : 'corrected'))
          : await readPaymentAllocations(trx, input.egcs_fc_payment), corrected: [] as JournalVoucherAccountingLine[], adjustments: [] as JournalVoucherAccountingLine[] }
    if (!previous) allocations.corrected = allocations.original.map(line => ({ ...line }))
    if (!allocations.original.length) return await journalVoucherError(event, 'JV_LINES_REQUIRED')
    await persistJournalVoucherLines(trx, String(created.id), input.egcs_fc_payment, 'original', allocations.original)
    await persistJournalVoucherLines(trx, String(created.id), input.egcs_fc_payment, 'corrected', allocations.corrected)
    await persistJournalVoucherLines(trx, String(created.id), input.egcs_fc_payment, 'adjustment', allocations.adjustments)
    return created
  }, { action: 'create', authorize: async (trx, context, auth) => {
    if (!auth.userAbilities.authorize('journal_voucher', 'create', context.scope)) return await forbidden(event)
    if (options.reversalOf) {
      const sourceContext = await resolveJournalVoucherRuntimeContext(trx, options.reversalOf)
      if (!sourceContext || sourceContext.agreementId !== context.agreementId
        || !auth.userAbilities.authorize('journal_voucher', 'read', sourceContext.scope)) return await forbidden(event)
    } else if (!auth.userAbilities.authorize('agreement', 'read', context.scope)) return await forbidden(event)
  } })
}

export const editJournalVoucher = async (event: H3Event, id: string, input: JournalVoucherEdit) => {
  const context = await authorizeJournalVoucher(event, id, 'update')
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async trx => {
    const header = await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow()
    const saved = await readJournalVoucherLines(trx, id)
    if (header.egcs_fc_reversalof) {
      const frozen = saved.filter(line => line.egcs_fc_kind === 'corrected')
      const supplied = input.egcs_fc_allocations
      if (supplied.length !== frozen.length || supplied.some((line, index) => line.egcs_fc_commitmentline !== frozen[index]?.egcs_fc_commitmentline || line.egcs_fc_chartofaccount !== frozen[index]?.egcs_fc_chartofaccount || line.egcs_fc_amount !== frozen[index]?.egcs_fc_amount)) return await journalVoucherError(event, 'JV_REVERSAL_READ_ONLY')
      return await trx.updateTable('Funding_Case_Agreement_Journal_Voucher').set({
        egcs_fc_requesteddate: sql<Date>`${input.egcs_fc_requesteddate.toISOString().slice(0, 10)}::date`,
        egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
    }
    const original = saved.filter(line => line.egcs_fc_kind === 'original')
    const choices = await readJournalVoucherCodingChoices(trx, context, header.egcs_fc_agencyfiscalyear)
    const corrected: JournalVoucherAccountingLine[] = []
    for (const line of input.egcs_fc_allocations) {
      const commitment = original.find(row => row.egcs_fc_commitmentline === line.egcs_fc_commitmentline)
      if (!commitment) return await journalVoucherError(event, 'JV_COMMITMENT_MISMATCH')
      // Retain saved historical coding when reusing it; new selections must be in the current catalog.
      const historical = saved.find(row => row.egcs_fc_chartofaccount === line.egcs_fc_chartofaccount && row.egcs_fc_kind !== 'adjustment')
      const choice = choices.find(row => String(row.id) === line.egcs_fc_chartofaccount)
      if (!historical && !choice) return await journalVoucherError(event, 'JV_CODING_NOT_ELIGIBLE')
      corrected.push({ ...line, egcs_fc_commitmentlinenumber: commitment.egcs_fc_commitmentlinenumber,
        egcs_fc_accountingdimensions: historical ? historical.egcs_fc_accountingdimensions : TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(choice!.egcs_ay_accountingdimensions) })
    }
    let adjustments: JournalVoucherAccountingLine[]
    try {
      adjustments = generateJournalVoucherAdjustments(original, corrected, { requireAdjustment: false })
    } catch (error) {
      if (!(error instanceof JournalVoucherAccountingError)) throw error
      return await journalVoucherError(event, error.code)
    }
    await trx.updateTable('Funding_Case_Agreement_Journal_Voucher_Line').set({ _deleted: true })
      .where('egcs_fc_journalvoucher', '=', id).where('egcs_fc_kind', 'in', ['corrected', 'adjustment']).where('_deleted', '=', false).execute()
    await persistJournalVoucherLines(trx, id, header.egcs_fc_payment, 'corrected', corrected)
    await persistJournalVoucherLines(trx, id, header.egcs_fc_payment, 'adjustment', adjustments)
    return await trx.updateTable('Funding_Case_Agreement_Journal_Voucher').set({
      egcs_fc_requesteddate: sql<Date>`${input.egcs_fc_requesteddate.toISOString().slice(0, 10)}::date`,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr
    }).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
  }, { assignmentTarget: { entityType: 'fundingcasejournalvoucher', entityId: id }, businessStatusTarget: { entityType: 'fundingcasejournalvoucher', entityId: id } })
}

export const getJournalVoucherDetail = async (event: H3Event, id: string) => {
  const context = await authorizeJournalVoucher(event, id)
  const db = event.context.$db
  const header = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const auth = await requireAuthContext(event)
  const fiscalYear = await db.selectFrom('Agency_Fiscal_Year').select('egcs_ay_jvopen').where('id', '=', header.egcs_fc_agencyfiscalyear).where('_deleted', '=', false).executeTakeFirst()
  const grant = await resolveAssignedItemTargetGrant(auth.userId, { entityType: 'fundingcasejournalvoucher', entityId: id }, db)
  const protection = await resolveBusinessStatusProtection(db, 'fundingcasejournalvoucher', id)
  const latest = await db.selectFrom('Funding_Case_Agreement_Journal_Voucher').select('id').where('egcs_fc_payment', '=', header.egcs_fc_payment).where('_deleted', '=', false).orderBy('egcs_fc_number', 'desc').executeTakeFirst()
  const canWork = auth.userAbilities.authorize('journal_voucher', 'update', context.scope) && grant?.actions.has('update') === true && String(latest?.id) === id
  const negative = await hasNegativeJournalVoucherCompletion(db, id)
  const canPrepare = auth.userAbilities.authorize('journal_voucher', 'create', context.scope) && String(latest?.id) === id
    && (negative || await hasPositiveCompletionTerminus(db, 'fundingcasejournalvoucher', id))
  const workflowEvidence = await db.selectFrom('Common_Workflow_Run as run').innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id').select('run.id').where('runtime.egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('runtime.egcs_cn_entityid', '=', id).executeTakeFirst()
  const runtimeEvidence = await db.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('egcs_cn_entityid', '=', id).executeTakeFirst()
  const decisionEvidence = await db.selectFrom('Common_Routing_Slip').select('id').where('egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('egcs_cn_entityid', '=', id).executeTakeFirst()
  const [state] = await withBusinessRecordState(db, 'fundingcasejournalvoucher', [header])
  const agreementCoding = await readJournalVoucherAgreementCoding(db, context.agreementId)
  return { ...state, egcs_fc_lines: (await readJournalVoucherLines(db, id)).map(line => ({
    ...line, egcs_fc_agreementcodingmatched: agreementCoding.has(String(line.egcs_fc_agencychartofaccount))
  })),
  egcs_fc_canwork: canWork, egcs_fc_canedit: canWork && !protection?.locked && !workflowEvidence && !decisionEvidence,
  egcs_fc_candelete: auth.userAbilities.authorize('journal_voucher', 'delete', context.scope) && grant?.actions.has('delete') === true && protection?.isDraft === true && !protection.completed && !runtimeEvidence && !decisionEvidence,
  egcs_fc_canreverse: canPrepare && !negative && !header.egcs_fc_reversalof,
  egcs_fc_canreplace: canPrepare && (header.egcs_fc_reversalof ? !negative : negative) && auth.userAbilities.authorize('agreement', 'read', context.scope),
  egcs_fc_fiscaleligible: fiscalYear?.egcs_ay_jvopen === true,
  egcs_fc_sourcereadable: auth.userAbilities.authorize('agreement', 'read', context.scope) }
}

export const deleteJournalVoucher = async (event: H3Event, id: string) => {
  const context = await authorizeJournalVoucher(event, id, 'delete')
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async trx => {
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasejournalvoucher', id)
    const runtime = await trx.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    const decision = await trx.selectFrom('Common_Routing_Slip').select('id').where('egcs_cn_entitytype', '=', 'fundingcasejournalvoucher').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    if (!protection?.isDraft || protection.completed || runtime || decision) return await journalVoucherError(event, 'JV_DELETE_EVIDENCE')
    await trx.updateTable('Funding_Case_Agreement_Journal_Voucher').set({ _deleted: true }).where('id', '=', id).execute()
    return { success: true }
  }, { action: 'delete', assignmentTarget: { entityType: 'fundingcasejournalvoucher', entityId: id }, businessStatusTarget: { entityType: 'fundingcasejournalvoucher', entityId: id } })
}
