import { resolveAgreementCurrency } from './agreement-currency'
import { assertAgreementCurrency } from '~~/server/utils/agreement-currency'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Correction domain contracts are documented in private architecture/corrections.md. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { CorrectionCreate, CorrectionEdit } from '~~/shared/types/schemas/correction'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { CorrectionAccountingError, validateCorrectionAdjustments } from '~~/shared/utils/correction'
import { isNumeric19Money, parseMoney, subtractMoney, sumMoney } from '~~/shared/utils/money'
import { authorize, requireAuthContext } from './authorize'
import { forbidden, notFound, throwApiError } from './api-errors'
import { resolveAgreementScopeContext } from './agreement'
import { resolveCorrectionRuntimeContext } from './correction-context'
import { executeFreshAuthorizedAgreementWrite } from './agreement-write-transaction'
import { createPrimaryEntityAssignment, resolveAssignmentCommonUserId } from './entity-assignment'
import { lockAgencyDraftStatus, resolveBusinessStatusProtection } from './business-status-runtime'
import { databaseMoneyText, databaseMoneyValue, parseDatabaseMoney } from './database-money'
import { agreementPaymentIsFinal, canReadAgreementPaymentSources, readAgreementPaymentAccountingSource, requireAgreementPaymentSourceRead } from './agreement-payment-source'
import { getAgreementAccountingCodingPools, getAgreementAccountingLines } from './agreement-accounting-projection'
import { hasPositiveCompletionTerminus } from './completion-terminus'
import { resolveAssignedItemTargetGrant } from './rbac'
import { withBusinessRecordState } from './business-record-state'

const ZERO = parseMoney('0.00')
export const correctionError = async (event: H3Event, code: string): Promise<never> => {
  await throwApiError(event, { statusCode: 409, code, key: 'apiErrors.correction.invalid_entry' })
  throw new CorrectionAccountingError(code)
}

export const authorizeCorrectionAgreement = async (event: H3Event, agreementId: string, action: 'read' | 'create') => {
  const context = await resolveAgreementScopeContext(agreementId, event.context.$db)
  if (!context) return await notFound(event, 'CORRECTION_NOT_FOUND', 'apiErrors.correction.not_found')
  await authorize(event, 'correction', action, context.scope)
  return context
}

export const authorizeCorrection = async (event: H3Event, id: string, action: 'read' | 'update' | 'delete' = 'read') => {
  const context = await resolveCorrectionRuntimeContext(event.context.$db, id)
  if (!context) return await notFound(event, 'CORRECTION_NOT_FOUND', 'apiErrors.correction.not_found')
  await authorize(event, 'correction', action, context.scope)
  return context
}

export const readCorrectionLines = async (db: Kysely<Database>, id: string) => {
  const rows = await db.selectFrom('Funding_Case_Agreement_Correction_Line as line')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_chartofaccount')
    .select(['line.id', 'line.egcs_fc_commitmentline', 'line.egcs_fc_commitmentlinenumber', 'line.egcs_fc_chartofaccount',
      'coding.egcs_tp_agencychartofaccount as egcs_fc_agencychartofaccount', 'line.egcs_fc_agencyfiscalyear',
      'line.egcs_fc_fiscalyeardisplay', 'line.egcs_fc_accountingdimensions',
      databaseMoneyText(sql.ref('line.egcs_fc_commitmentamount')).as('egcs_fc_commitmentamount'),
      databaseMoneyText(sql.ref('line.egcs_fc_originalpaid')).as('egcs_fc_originalpaid'),
      databaseMoneyText(sql.ref('line.egcs_fc_jveffect')).as('egcs_fc_jveffect'),
      databaseMoneyText(sql.ref('line.egcs_fc_priorcorrections')).as('egcs_fc_priorcorrections'),
      databaseMoneyText(sql.ref('line.egcs_fc_adjustment')).as('egcs_fc_adjustment')])
    .where('line.egcs_fc_correction', '=', id).where('line._deleted', '=', false).orderBy('line.egcs_fc_commitmentlinenumber').execute()
  return rows.map(row => {
    const money = { egcs_fc_commitmentamount: parseDatabaseMoney(row.egcs_fc_commitmentamount),
      egcs_fc_originalpaid: parseDatabaseMoney(row.egcs_fc_originalpaid), egcs_fc_jveffect: parseDatabaseMoney(row.egcs_fc_jveffect),
      egcs_fc_priorcorrections: parseDatabaseMoney(row.egcs_fc_priorcorrections), egcs_fc_adjustment: parseDatabaseMoney(row.egcs_fc_adjustment) }
    const corrected = sumMoney([money.egcs_fc_originalpaid, money.egcs_fc_jveffect, money.egcs_fc_priorcorrections, money.egcs_fc_adjustment])
    return { ...row, ...money, egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(row.egcs_fc_accountingdimensions),
      egcs_fc_correctedpaid: corrected, egcs_fc_remaining: subtractMoney(money.egcs_fc_commitmentamount, corrected) }
  })
}

const assertCreationReadiness = async (event: H3Event, trx: Transaction<Database>, agreementId: string, commitmentId: string) => {
  const open = await trx.selectFrom('Funding_Case_Agreement_Correction').select('id')
    .where('egcs_fc_fundingagreement', '=', agreementId).where('egcs_fc_outcome', '=', 'open').where('_deleted', '=', false).executeTakeFirst()
  if (open) return await correctionError(event, 'COR_AGREEMENT_LOCKED')
  const commitment = await trx.selectFrom('Funding_Case_Agreement_Commitment').select('id')
    .where('id', '=', commitmentId).where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_active', '=', true).where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!commitment) return await correctionError(event, 'COR_COMMITMENT_NOT_ACTIVE')
  const unfinishedPayments = await trx.selectFrom('Funding_Case_Agreement_Payment as payment')
    .innerJoin('Common_Status as status', 'status.id', 'payment.egcs_fc_status').select('payment.id')
    .where('payment.egcs_fc_fundingagreement', '=', agreementId).where('payment._deleted', '=', false)
    .where(eb => eb.or([eb('status.egcs_cn_terminal', '=', false), eb('status._deleted', '=', true)])).executeTakeFirst()
  if (unfinishedPayments) return await correctionError(event, 'COR_PAYMENT_UNRESOLVED')
  const commitments = await trx.selectFrom('Funding_Case_Agreement_Commitment as commitment')
    .innerJoin('Common_Status as status', 'status.id', 'commitment.egcs_fc_status').select('commitment.id')
    .where('commitment.egcs_fc_fundingagreement', '=', agreementId).where('commitment._deleted', '=', false)
    .where('commitment.egcs_fc_active', '=', false).where('status.egcs_cn_terminal', '=', false).execute()
  for (const historical of commitments) {
    if (!await hasPositiveCompletionTerminus(trx, 'fundingcaseagreementcommitment', String(historical.id))) {
      return await correctionError(event, 'COR_COMMITMENT_UNRESOLVED')
    }
  }
  const activeRuntime = await trx.selectFrom('Common_Runtime as runtime').select('runtime.id')
    .where('runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused']).where('runtime._deleted', '=', false)
    .where(sql<boolean>`(
      (runtime.egcs_cn_entitytype = 'fundingcasepayment' AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Payment" p WHERE p.id = runtime.egcs_cn_entityid AND p.egcs_fc_fundingagreement = ${agreementId} AND NOT p._deleted))
      OR (runtime.egcs_cn_entitytype = 'fundingcaseagreementcommitment' AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Commitment" c WHERE c.id = runtime.egcs_cn_entityid AND c.egcs_fc_fundingagreement = ${agreementId} AND NOT c._deleted))
      OR (runtime.egcs_cn_entitytype = 'fundingcasejournalvoucher' AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Journal_Voucher" j WHERE j.id = runtime.egcs_cn_entityid AND j.egcs_fc_fundingagreement = ${agreementId} AND NOT j._deleted))
      OR (runtime.egcs_cn_entitytype = 'fundingcaseamendment' AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Amendment" a WHERE a.id = runtime.egcs_cn_entityid AND a.egcs_fc_fundingagreement = ${agreementId} AND NOT a._deleted))
      OR (runtime.egcs_cn_entitytype = 'fundingcaseagreementcloseout' AND EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Closeout" c WHERE c.id = runtime.egcs_cn_entityid AND c.egcs_fc_fundingagreement = ${agreementId} AND NOT c._deleted))
    )`).executeTakeFirst()
  if (activeRuntime) return await correctionError(event, 'COR_FINANCIAL_WORK_UNRESOLVED')
  const vouchers = await trx.selectFrom('Funding_Case_Agreement_Journal_Voucher as voucher')
    .innerJoin('Common_Status as status', 'status.id', 'voucher.egcs_fc_status').select(['voucher.id', 'status.egcs_cn_terminal'])
    .where('voucher.egcs_fc_fundingagreement', '=', agreementId).where('voucher._deleted', '=', false).execute()
  for (const voucher of vouchers) {
    if (!voucher.egcs_cn_terminal && !await hasPositiveCompletionTerminus(trx, 'fundingcasejournalvoucher', String(voucher.id))) {
      const latest = await trx.selectFrom('Common_Runtime').select('egcs_cn_state').where('egcs_cn_entitytype', '=', 'fundingcasejournalvoucher')
        .where('egcs_cn_entityid', '=', String(voucher.id)).where('_deleted', '=', false).orderBy('id', 'desc').executeTakeFirst()
      if (!latest || !['unsuccessful', 'denied', 'failed', 'cancelled'].includes(latest.egcs_cn_state)) return await correctionError(event, 'COR_JV_UNRESOLVED')
    }
  }
}

const validateCurrencyLineage = async (db: Kysely<Database>, agreementId: string, commitmentId: string, currency: Database['Funding_Case_Agreement_Payment']['egcs_fc_currency']) => {
  if (await resolveAgreementCurrency(db, agreementId) !== currency) throw new CorrectionAccountingError('COR_CURRENCY_AMBIGUOUS')
  const commitment = await db.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_currency')
    .where('id', '=', commitmentId).where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
  if (!commitment || commitment.egcs_fc_currency !== currency) throw new CorrectionAccountingError('COR_CURRENCY_AMBIGUOUS')
  const mismatchedChart = await db.selectFrom('Funding_Case_Agreement_Commitment_Line as line')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as coding', 'coding.id', 'line.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as chart', 'chart.id', 'coding.egcs_tp_agencychartofaccount')
    .select('line.id').where('line.egcs_fc_commitment', '=', commitmentId).where('line._deleted', '=', false)
    .where('chart.egcs_ay_currency', '!=', currency).executeTakeFirst()
  if (mismatchedChart) throw new CorrectionAccountingError('COR_CURRENCY_AMBIGUOUS')
}

export const createCorrection = async (event: H3Event, agreementId: string, input: CorrectionCreate) => {
  const initial = await authorizeCorrectionAgreement(event, agreementId, 'create')
  for (const paymentId of input.egcs_fc_payments) {
    const source = await requireAgreementPaymentSourceRead(event, event.context.$db, paymentId)
    if (source.agreementId !== agreementId) return await correctionError(event, 'COR_SOURCE_AGREEMENT')
  }
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, agreementId, initial, async (trx, context, auth) => {
    await assertCreationReadiness(event, trx, agreementId, input.egcs_fc_commitment)
    const sources = []
    // All authorized extraction finishes before aggregate or assignment insertion.
    for (const paymentId of input.egcs_fc_payments) {
      const accounting = await readAgreementPaymentAccountingSource(event, trx, paymentId, { agreementId: context.agreementId, auth })
      const source = await trx.selectFrom('Funding_Case_Agreement_Payment as payment').select(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }).as('final'))
        .where('payment.id', '=', paymentId).where('payment.egcs_fc_fundingagreement', '=', agreementId).executeTakeFirstOrThrow()
      if (!source.final || !accounting.allocations.length) return await correctionError(event, 'COR_SOURCE_NOT_FINAL')
      sources.push({ paymentId, accounting })
    }
    const currency = sources[0]!.accounting.header.egcs_fc_currency
    await assertAgreementCurrency(event, trx, agreementId, currency)
    if (sources.some(source => source.accounting.header.egcs_fc_currency !== currency)) return await correctionError(event, 'COR_CURRENCY_AMBIGUOUS')
    try {
      await validateCurrencyLineage(trx, agreementId, input.egcs_fc_commitment, currency)
    } catch (error) {
      if (!(error instanceof CorrectionAccountingError)) throw error
      return await correctionError(event, error.code)
    }
    if (input.egcs_fc_linkedcorrection) {
      const linked = await trx.selectFrom('Funding_Case_Agreement_Correction').select('egcs_fc_outcome')
        .where('id', '=', input.egcs_fc_linkedcorrection).where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
      if (!linked || linked.egcs_fc_outcome === 'open') return await correctionError(event, 'COR_LINK_NOT_TERMINAL')
    }
    const lines = (await getAgreementAccountingLines(trx, agreementId, { paymentMode: 'finalized' })).filter(line => String(line.egcs_fc_commitment) === input.egcs_fc_commitment)
    if (!lines.length) return await correctionError(event, 'COR_LINES_REQUIRED')
    if (lines.some(line => ![line.egcs_fc_commitmentamount, line.egcs_fc_originalpaid, line.egcs_fc_jveffect, line.egcs_fc_priorcorrections].every(isNumeric19Money))) {
      return await correctionError(event, 'COR_PRECISION')
    }
    if (!sources.some(source => source.accounting.allocations.some(allocation => lines.some(line => String(line.id) === allocation.egcs_fc_commitmentline)))) {
      return await correctionError(event, 'COR_SOURCE_LINEAGE')
    }
    const creatorId = await resolveAssignmentCommonUserId(trx, auth.userId)
    if (!creatorId) return await forbidden(event)
    const number = await trx.selectFrom('Funding_Case_Agreement_Correction').select(eb => eb.fn.max<number>('egcs_fc_number').as('maximum'))
      .where('egcs_fc_fundingagreement', '=', agreementId).executeTakeFirstOrThrow()
    const created = await trx.insertInto('Funding_Case_Agreement_Correction').values({
      egcs_fc_fundingagreement: agreementId, egcs_fc_commitment: input.egcs_fc_commitment,
      egcs_fc_number: (number.maximum ?? 0) + 1, egcs_fc_agreementnumber: sources[0]!.accounting.header.egcs_fc_agreementnumber,
      egcs_fc_currency: currency, egcs_fc_requesteddate: sql<Date>`${input.egcs_fc_requesteddate.toISOString().slice(0, 10)}::date`,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr,
      egcs_fc_linkedcorrection: input.egcs_fc_linkedcorrection ?? null, egcs_fc_createdby: creatorId,
      egcs_fc_status: await lockAgencyDraftStatus(trx, context.agencyId), egcs_fc_postedat: null, egcs_fc_postingruntime: null,
      egcs_fc_terminalby: null, egcs_fc_terminalat: null, egcs_fc_terminalreason: null
    }).returningAll().executeTakeFirstOrThrow()
    await createPrimaryEntityAssignment(trx, 'fundingcasecorrection', String(created.id), creatorId)
    for (const source of sources) {
      await trx.insertInto('Funding_Case_Agreement_Correction_Source').values({ egcs_fc_correction: String(created.id),
        egcs_fc_fundingagreement: agreementId, egcs_fc_payment: source.paymentId,
        egcs_fc_evidence: sql`${JSON.stringify(source.accounting)}::jsonb` }).execute()
    }
    for (const line of lines) {
      const sourceLine = sources.flatMap(source => source.accounting.allocations).find(allocation => allocation.egcs_fc_commitmentline === String(line.id))
      await trx.insertInto('Funding_Case_Agreement_Correction_Line').values({
        egcs_fc_correction: String(created.id), egcs_fc_fundingagreement: agreementId, egcs_fc_commitmentline: String(line.id),
        egcs_fc_commitmentlinenumber: line.egcs_fc_commitmentlinenumber, egcs_fc_chartofaccount: String(line.egcs_fc_chartofaccount),
        egcs_fc_agencyfiscalyear: String(line.egcs_fc_agencyfiscalyear), egcs_fc_fiscalyeardisplay: line.egcs_fc_fiscalyeardisplay,
        egcs_fc_accountingdimensions: sql`${JSON.stringify(sourceLine?.egcs_fc_accountingdimensions ?? line.egcs_fc_accountingdimensions)}::jsonb`,
        egcs_fc_commitmentamount: databaseMoneyValue(line.egcs_fc_commitmentamount), egcs_fc_originalpaid: databaseMoneyValue(line.egcs_fc_originalpaid),
        egcs_fc_jveffect: databaseMoneyValue(line.egcs_fc_jveffect), egcs_fc_priorcorrections: databaseMoneyValue(line.egcs_fc_priorcorrections),
        egcs_fc_adjustment: databaseMoneyValue(ZERO)
      }).execute()
    }
    // Capture an over-recorded basis so a negative adjustment can repair it.
    // Proposed line and shared-pool limits are enforced on edits and Completion.
    return created
  }, { action: 'create', authorize: async (_trx, context, auth) => {
    if (!auth.userAbilities.authorize('correction', 'create', context.scope)) return await forbidden(event)
  } })
}

/** Engine-only integrity validation never grants or performs actor source API access. */
export const validateCorrectionPostingBasis = async (
  trx: Kysely<Database>, id: string, options: { requireAdjustment: boolean } = { requireAdjustment: true }
) => {
  const header = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (header.egcs_fc_outcome !== 'open') throw new CorrectionAccountingError('COR_TERMINAL')
  await validateCurrencyLineage(trx, String(header.egcs_fc_fundingagreement), String(header.egcs_fc_commitment), header.egcs_fc_currency)
  if (options.requireAdjustment && !header.egcs_fc_narrative_en.trim() && !header.egcs_fc_narrative_fr.trim()) throw new CorrectionAccountingError('COR_RATIONALE_REQUIRED')
  const saved = await readCorrectionLines(trx, id)
  const current = (await getAgreementAccountingLines(trx, String(header.egcs_fc_fundingagreement), { paymentMode: 'finalized' }))
    .filter(line => String(line.egcs_fc_commitment) === String(header.egcs_fc_commitment))
  if (!saved.length || saved.length !== current.length) throw new CorrectionAccountingError('COR_BASIS_CHANGED')
  for (const line of saved) {
    const live = current.find(candidate => String(candidate.id) === String(line.egcs_fc_commitmentline))
    if (!live || String(live.egcs_fc_chartofaccount) !== String(line.egcs_fc_chartofaccount)
      || String(live.egcs_fc_agencyfiscalyear) !== String(line.egcs_fc_agencyfiscalyear)
      || ['egcs_fc_commitmentamount', 'egcs_fc_originalpaid', 'egcs_fc_jveffect', 'egcs_fc_priorcorrections'].some(key =>
        live[key as keyof typeof live] !== line[key as keyof typeof line])) throw new CorrectionAccountingError('COR_BASIS_CHANGED')
  }
  const sources = await trx.selectFrom('Funding_Case_Agreement_Correction_Source as source')
    .innerJoin('Funding_Case_Agreement_Payment as payment', 'payment.id', 'source.egcs_fc_payment')
    .select(['payment.egcs_fc_currency', 'payment.egcs_fc_fundingagreement', agreementPaymentIsFinal('payment', { requireResolvedApproval: true }).as('final')])
    .where('source.egcs_fc_correction', '=', id).where('source._deleted', '=', false).execute()
  if (!sources.length || sources.some(source => !source.final || source.egcs_fc_currency !== header.egcs_fc_currency
    || String(source.egcs_fc_fundingagreement) !== String(header.egcs_fc_fundingagreement))) throw new CorrectionAccountingError('COR_SOURCE_NOT_FINAL')
  return validateCorrectionAdjustments(saved, await getAgreementAccountingCodingPools(trx, String(header.egcs_fc_fundingagreement)), options)
}

export const validateCorrectionBasis = async (event: H3Event, trx: Kysely<Database>, id: string, options: { requireAdjustment: boolean }) => {
  try {
    return await validateCorrectionPostingBasis(trx, id, options)
  } catch (error) {
    if (!(error instanceof CorrectionAccountingError)) throw error
    return await correctionError(event, error.code)
  }
}

export const editCorrection = async (event: H3Event, id: string, input: CorrectionEdit) => {
  const initial = await authorizeCorrection(event, id, 'update')
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, initial.agreementId, initial, async trx => {
    const header = await trx.selectFrom('Funding_Case_Agreement_Correction').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow()
    if (header.egcs_fc_outcome !== 'open') return await correctionError(event, 'COR_TERMINAL')
    const lines = await readCorrectionLines(trx, id)
    if (input.egcs_fc_lines.length !== lines.length || new Set(input.egcs_fc_lines.map(line => line.egcs_fc_commitmentline)).size !== lines.length) {
      return await correctionError(event, 'COR_LINE_MISMATCH')
    }
    for (const inputLine of input.egcs_fc_lines) {
      const saved = lines.find(line => String(line.egcs_fc_commitmentline) === inputLine.egcs_fc_commitmentline)
      if (!saved) return await correctionError(event, 'COR_LINE_MISMATCH')
      await trx.updateTable('Funding_Case_Agreement_Correction_Line').set({ egcs_fc_adjustment: databaseMoneyValue(inputLine.egcs_fc_adjustment) })
        .where('id', '=', String(saved.id)).execute()
    }
    await trx.updateTable('Funding_Case_Agreement_Correction').set({
      egcs_fc_requesteddate: sql<Date>`${input.egcs_fc_requesteddate.toISOString().slice(0, 10)}::date`,
      egcs_fc_narrative_en: input.egcs_fc_narrative_en, egcs_fc_narrative_fr: input.egcs_fc_narrative_fr
    }).where('id', '=', id).execute()
    await validateCorrectionBasis(event, trx, id, { requireAdjustment: false })
    return { id }
  }, { correctionId: id, assignmentTarget: { entityType: 'fundingcasecorrection', entityId: id },
    businessStatusTarget: { entityType: 'fundingcasecorrection', entityId: id } })
}

export const getCorrectionDetail = async (event: H3Event, id: string) => {
  const context = await authorizeCorrection(event, id)
  const db = event.context.$db
  const header = await db.selectFrom('Funding_Case_Agreement_Correction').selectAll().where('id', '=', id).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const sources = await db.selectFrom('Funding_Case_Agreement_Correction_Source').select(['id', 'egcs_fc_payment', 'egcs_fc_evidence'])
    .where('egcs_fc_correction', '=', id).where('_deleted', '=', false).orderBy('id').execute()
  const auth = await requireAuthContext(event)
  const grant = await resolveAssignedItemTargetGrant(auth.userId, { entityType: 'fundingcasecorrection', entityId: id }, db)
  const protection = await resolveBusinessStatusProtection(db, 'fundingcasecorrection', id)
  const runtime = await db.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcasecorrection')
    .where('egcs_cn_entityid', '=', id).executeTakeFirst()
  const decision = await db.selectFrom('Common_Routing_Slip').select('id').where('egcs_cn_entitytype', '=', 'fundingcasecorrection')
    .where('egcs_cn_entityid', '=', id).executeTakeFirst()
  const canWork = header.egcs_fc_outcome === 'open' && auth.userAbilities.authorize('correction', 'update', context.scope) && grant?.actions.has('update') === true
  const [state] = await withBusinessRecordState(db, 'fundingcasecorrection', [header])
  return { ...state, egcs_fc_lines: await readCorrectionLines(db, id), egcs_fc_sources: sources,
    egcs_fc_agreementreadable: auth.userAbilities.authorize('agreement', 'read', context.scope),
    egcs_fc_sourcereadable: canReadAgreementPaymentSources(auth, context), egcs_fc_canwork: canWork,
    egcs_fc_canedit: canWork && protection?.locked === false && !runtime && !decision,
    egcs_fc_cancancel: canWork && protection?.terminal === false,
    egcs_fc_candelete: header.egcs_fc_outcome === 'open' && auth.userAbilities.authorize('correction', 'delete', context.scope)
      && grant?.actions.has('delete') === true && protection?.isDraft === true && !protection.completed && !runtime && !decision,
    egcs_fc_canlink: header.egcs_fc_outcome !== 'open' && auth.userAbilities.authorize('correction', 'create', context.scope) }
}

export const deleteCorrection = async (event: H3Event, id: string) => {
  const context = await authorizeCorrection(event, id, 'delete')
  return await executeFreshAuthorizedAgreementWrite(event, event.context.$db, context.agreementId, context, async trx => {
    const header = await trx.selectFrom('Funding_Case_Agreement_Correction').select('egcs_fc_outcome').where('id', '=', id).forUpdate().executeTakeFirstOrThrow()
    const protection = await resolveBusinessStatusProtection(trx, 'fundingcasecorrection', id)
    const evidence = await trx.selectFrom('Common_Runtime').select('id').where('egcs_cn_entitytype', '=', 'fundingcasecorrection').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    const decision = await trx.selectFrom('Common_Routing_Slip').select('id').where('egcs_cn_entitytype', '=', 'fundingcasecorrection').where('egcs_cn_entityid', '=', id).executeTakeFirst()
    if (header.egcs_fc_outcome !== 'open' || !protection?.isDraft || protection.completed || evidence || decision) return await correctionError(event, 'COR_DELETE_LOCKED')
    await trx.updateTable('Funding_Case_Agreement_Correction').set({ _deleted: true }).where('id', '=', id).execute()
    return { success: true }
  }, { action: 'delete', correctionId: id, assignmentTarget: { entityType: 'fundingcasecorrection', entityId: id },
    businessStatusTarget: { entityType: 'fundingcasecorrection', entityId: id } })
}
