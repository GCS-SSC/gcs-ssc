/**
 * Adds an inspectable Financial Summary sample to an already-seeded local PGlite database.
 *
 * Run: bun run seed:financial-summary-demo --pglite-dir .data/pglite
 * The agreement number and scoped overlap markers make repeat runs idempotent.
 */
/* eslint-disable jsdoc/require-jsdoc -- Seed-only local helpers are documented by the script contract. */
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { Kysely, sql, type RawBuilder, type Transaction } from 'kysely'
import { KyselyPGlite } from 'kysely-pglite'
import { types as pgliteTypes } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import type { Database } from '../shared/types/database'

const AGREEMENT_NUMBER = 'AGR-FIN-DEMO-1'
const TITLE_EN = 'Financial Summary and Pacing Showcase'
const TITLE_FR = 'Démonstration du sommaire financier et du rythme'
const OVERLAP_CLAIM_RECEIVED = new Date('2025-07-30T00:00:00Z')
const OVERLAP_PAYMENT_COMMENT = 'Financial Summary showcase: overlapping June payment.'
const money = (value: string): RawBuilder<number> => sql<number>`CAST(${value} AS numeric(19, 2))`
const yearForecasts = [
  [
    ['6000', '8000', '7000', '9000', '12000', '15000', '14000', '12000', '10000', '9000', '10000', '8000'],
    ['2000', '2500', '2500', '3000', '3500', '4000', '4500', '4000', '3500', '3500', '4000', '3000']
  ],
  [
    ['8000', '9000', '10000', '12000', '14000', '17000', '18000', '16000', '14000', '12000', '11000', '9000'],
    ['2500', '3000', '3500', '4000', '4500', '5000', '5500', '5500', '5000', '4500', '4000', '3000']
  ]
] as const

const args = process.argv.slice(2)
const directoryArg = args[args.indexOf('--pglite-dir') + 1]
if (!args.includes('--pglite-dir') || !directoryArg || directoryArg.startsWith('--')) {
  throw new Error('Pass an existing local PGlite directory with --pglite-dir PATH.')
}
const databaseDirectory = resolve(directoryArg)
if (!existsSync(databaseDirectory)) throw new Error(`PGlite directory does not exist: ${databaseDirectory}`)
if (process.env.DATABASE_URL) throw new Error('This sample script supports local PGlite only; unset DATABASE_URL.')
// PGlite 0.3.16 does not lock its NodeFS data directory across processes. A second opener can
// corrupt its WAL, so refuse the shared development directory while a local dev server runs.
if (databaseDirectory === resolve('.data/pglite')) {
  if (!existsSync('/proc')) {
    throw new Error('Cannot verify that .data/pglite is unused on this platform. Stop the local development server and seed a separate PGlite directory instead.')
  }
  let processEntries: string[]
  try {
    processEntries = readdirSync('/proc')
  } catch {
    throw new Error('Cannot inspect running processes before opening .data/pglite. Stop the local development server and seed a separate PGlite directory instead.')
  }
  const localDevServer = processEntries.some(entry => {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) return false
    try {
      if (readlinkSync(`/proc/${entry}/cwd`) !== process.cwd()) return false
      const command = readFileSync(`/proc/${entry}/cmdline`, 'utf8').replaceAll('\0', ' ')
      return /\bnuxt\s+dev\b|\bscripts\/dev\.ts\b|\bbun\s+run\s+dev\b/.test(command)
    } catch {
      return false
    }
  })
  if (localDevServer) throw new Error('Stop the local development server before seeding .data/pglite, then rerun this command.')
}

const dialect = new KyselyPGlite(databaseDirectory, {
  extensions: { citext },
  parsers: { [pgliteTypes.INT8]: String }
}).dialect
const db = new Kysely<Database>({ dialect })

const addPrimaryAssignment = async (
  trx: Transaction<Database>, entityType: Database['Common_Entity_Assignment']['egcs_cn_entitytype'],
  entityId: string, userId: string
) => {
  await trx.insertInto('Common_Entity_Assignment').values({
    egcs_cn_entityid: entityId,
    egcs_cn_entitytype: entityType,
    egcs_cn_user: userId,
    egcs_cn_isprimary: true,
    egcs_cn_createdby: userId
  }).execute()
}

const addJuneOverlap = async (
  trx: Transaction<Database>, agreementId: string, userId: string,
  status: (name: string) => string
): Promise<void> => {
  const firstYear = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .select('Funding_Case_Agreement_Budget_Fiscal_Year.id as id')
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', agreementId)
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc').executeTakeFirstOrThrow()
  const fiscalYearId = String(firstYear.id)
  const budgetLines = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .select('id')
    .where('egcs_fc_fundingagreementbudgetfiscalyear', '=', fiscalYearId)
    .where('_deleted', '=', false).orderBy('id', 'asc').limit(2).execute()
  if (budgetLines.length !== 2) throw new Error('The showcase overlap requires two budget lines in its first year.')

  const existingClaim = await trx.selectFrom('Funding_Case_Agreement_Claim')
    .select('id').where('egcs_fc_fundingagreement', '=', agreementId)
    .where('egcs_fc_fiscalyear', '=', fiscalYearId)
    .where('egcs_fc_periodstart', '=', 0).where('egcs_fc_periodend', '=', 2)
    .where('egcs_fc_receiveddate', '=', OVERLAP_CLAIM_RECEIVED)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!existingClaim) {
    const claim = await trx.insertInto('Funding_Case_Agreement_Claim').values({
      egcs_fc_fundingagreement: agreementId, egcs_fc_fiscalyear: fiscalYearId,
      egcs_fc_isfinalforyear: false, egcs_fc_periodstart: 0, egcs_fc_periodend: 2,
      egcs_fc_receiveddate: OVERLAP_CLAIM_RECEIVED,
      egcs_fc_status: status('Draft'), _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const claimId = String(claim.id)
    await addPrimaryAssignment(trx, 'fundingcaseagreementclaim', claimId, userId)
    const lines = await trx.insertInto('Funding_Case_Agreement_Claim_Line_Item').values([
      {
        egcs_fc_fundingagreementclaim: claimId,
        egcs_fc_fundingagreementbudgetlineitem: String(budgetLines[0]!.id),
        egcs_fc_description: 'Showcase overlapping April–June participant costs.',
        egcs_fc_amount: money('6000.00'), egcs_fc_currency: 'cad', _deleted: false
      },
      {
        egcs_fc_fundingagreementclaim: claimId,
        egcs_fc_fundingagreementbudgetlineitem: String(budgetLines[1]!.id),
        egcs_fc_description: 'Showcase overlapping April–June operations costs.',
        egcs_fc_amount: money('2000.00'), egcs_fc_currency: 'cad', _deleted: false
      }
    ]).returning('id').execute()
    await trx.updateTable('Funding_Case_Agreement_Claim').set({ egcs_fc_status: status('In Review') })
      .where('id', '=', claimId).execute()
    const reconciliation = await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile').values({
      egcs_fc_fundingagreementclaim: claimId, egcs_fc_user: userId,
      egcs_fc_status: status('Draft'), egcs_fc_isfinal: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const reconciliationId = String(reconciliation.id)
    await addPrimaryAssignment(trx, 'fundingclaimreconcile', reconciliationId, userId)
    await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item').values([
      { egcs_fc_fundingagreementclaimreconcile: reconciliationId, egcs_fc_lineitem: String(lines[0]!.id), egcs_fc_reconciled: money('5500.00'), _deleted: false },
      { egcs_fc_fundingagreementclaimreconcile: reconciliationId, egcs_fc_lineitem: String(lines[1]!.id), egcs_fc_reconciled: money('1500.00'), _deleted: false }
    ]).execute()
    await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile').set({ egcs_fc_status: status('Approved') })
      .where('id', '=', reconciliationId).execute()
    await trx.insertInto('Common_Completion').values({
      egcs_cn_entitytype: 'fundingclaimreconcile', egcs_cn_entityid: reconciliationId,
      egcs_cn_comments: 'Approved overlapping June claim in Financial Summary showcase.',
      egcs_cn_user: userId, egcs_cn_disposition: 'no_workflow',
      egcs_cn_completedat: new Date('2025-07-30T12:00:00Z'), _deleted: false
    }).execute()
  }

  const commitment = await trx.selectFrom('Funding_Case_Agreement_Commitment')
    .select('id').where('egcs_fc_fundingagreement', '=', agreementId)
    .where('_deleted', '=', false).orderBy('id', 'asc').executeTakeFirstOrThrow()
  const commitmentLine = await trx.selectFrom('Funding_Case_Agreement_Commitment_Line')
    .select('id').where('egcs_fc_commitment', '=', String(commitment.id))
    .where('_deleted', '=', false).orderBy('id', 'asc').executeTakeFirstOrThrow()
  const existingPayment = await trx.selectFrom('Funding_Case_Agreement_Payment')
    .select('id').where('egcs_fc_fundingagreementcommitment', '=', String(commitment.id))
    .where('egcs_fc_fiscalyear', '=', fiscalYearId)
    .where('egcs_fc_comment', '=', OVERLAP_PAYMENT_COMMENT)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!existingPayment) {
    const payment = await trx.insertInto('Funding_Case_Agreement_Payment').values({
      egcs_fc_fundingagreementcommitment: String(commitment.id), egcs_fc_fiscalyear: fiscalYearId,
      egcs_fc_paymenttype: 'reimbursement', egcs_fc_periodstart: 1, egcs_fc_periodend: 2,
      egcs_fc_paymentamount: money('4000.00'), egcs_fc_currency: 'cad',
      egcs_fc_comment: OVERLAP_PAYMENT_COMMENT,
      egcs_fc_status: status('Draft'), _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const paymentId = String(payment.id)
    await addPrimaryAssignment(trx, 'fundingcasepayment', paymentId, userId)
    await trx.insertInto('Funding_Case_Agreement_Payment_Line').values({
      egcs_fc_fundingagreementpayment: paymentId,
      egcs_fc_fundingagreementcommitmentline: String(commitmentLine.id),
      egcs_fc_amount: money('4000.00'), _deleted: false
    }).execute()
    await trx.updateTable('Funding_Case_Agreement_Payment').set({ egcs_fc_status: status('Paid') })
      .where('id', '=', paymentId).execute()
  }
}

const seed = async (trx: Transaction<Database>): Promise<string> => {
  const existing = await trx.selectFrom('Funding_Case_Agreement_Profile')
    .select(['id', 'egcs_fc_title_en'])
    .where('egcs_fc_agreementnumber', '=', AGREEMENT_NUMBER).executeTakeFirst()
  if (existing) {
    if (existing.egcs_fc_title_en !== TITLE_EN) throw new Error(`Agreement number ${AGREEMENT_NUMBER} belongs to a different record.`)
  }

  const source = await trx.selectFrom('Funding_Case_Agreement_Profile')
    .selectAll()
    .where('egcs_fc_title_en', '=', 'Health Canada Cost Agreement 1 - Showcase')
    .where('_deleted', '=', false).executeTakeFirstOrThrow()
  const rootUser = await trx.selectFrom('Common_User').select('id')
    .where('egcs_cn_email', '=', 'root@example.com').where('_deleted', '=', false).executeTakeFirstOrThrow()
  const agency = await trx.selectFrom('Transfer_Payment_Stream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select('Transfer_Payment_Profile.egcs_tp_agency as id')
    .where('Transfer_Payment_Stream.id', '=', source.egcs_fc_transferpaymentstream).executeTakeFirstOrThrow()
  const statuses = await trx.selectFrom('Common_Status')
    .select(['id', 'egcs_cn_name_en'])
    .where('egcs_cn_agency', '=', String(agency.id)).where('_deleted', '=', false).execute()
  const statusByName = new Map<string, string>()
  for (const row of statuses) {
    if (statusByName.has(row.egcs_cn_name_en)) throw new Error(`Ambiguous seeded ${row.egcs_cn_name_en} status.`)
    statusByName.set(row.egcs_cn_name_en, String(row.id))
  }
  const status = (name: string): string => {
    const id = statusByName.get(name)
    if (!id) throw new Error(`Missing seeded ${name} status.`)
    return id
  }
  if (existing) {
    await addJuneOverlap(trx, String(existing.id), String(rootUser.id), status)
    return String(existing.id)
  }

  const agreement = await trx.insertInto('Funding_Case_Agreement_Profile').values({
    egcs_fc_agreementnumber: AGREEMENT_NUMBER,
    egcs_fc_transferpaymentstream: source.egcs_fc_transferpaymentstream,
    egcs_fc_financialsystemnumber: '99000051',
    egcs_fc_title_en: TITLE_EN,
    egcs_fc_title_fr: TITLE_FR,
    egcs_fc_description_en: 'Illustrative two-year agreement with uneven monthly forecasts, overlapping claims, approved reconciliations, and period-end payments for the Financial Summary view.',
    egcs_fc_description_fr: 'Entente illustrative de deux ans avec des prévisions mensuelles variables, des réclamations qui se chevauchent, des rapprochements approuvés et des paiements en fin de période pour le sommaire financier.',
    egcs_fc_agreementtype: source.egcs_fc_agreementtype,
    egcs_fc_agreementsubtype: source.egcs_fc_agreementsubtype,
    egcs_fc_furtherdistribution: false,
    egcs_fc_holdback: 0,
    egcs_fc_holdbackbasis: source.egcs_fc_holdbackbasis,
    egcs_fc_status: status('Draft'),
    egcs_fc_authorizedassistancestartdate: new Date('2025-04-01T00:00:00Z'),
    egcs_fc_authorizedassistanceenddate: new Date('2027-03-31T23:59:59Z'),
    _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  const agreementId = String(agreement.id)
  const userId = String(rootUser.id)
  await addPrimaryAssignment(trx, 'fundingcaseagreement', agreementId, userId)
  await trx.updateTable('Funding_Case_Agreement_Profile').set({ egcs_fc_status: status('Active') })
    .where('id', '=', agreementId).execute()

  const sourceYears = await trx.selectFrom('Funding_Case_Agreement_Budget_Fiscal_Year')
    .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
    .select('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear as fiscalYearId')
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', String(source.id))
    .where('Funding_Case_Agreement_Budget_Fiscal_Year._deleted', '=', false)
    .orderBy('Agency_Fiscal_Year.egcs_ay_fiscalyear', 'asc').limit(2).execute()
  const sourceCostLines = await trx.selectFrom('Funding_Case_Agreement_Budget_Line_Item')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Line_Item.egcs_fc_fundingagreementbudgetfiscalyear')
    .select('Funding_Case_Agreement_Budget_Line_Item.egcs_fc_organizationcostcategory as costLineId')
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fundingagreement', '=', String(source.id))
    .where('Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear', '=', String(sourceYears[0]?.fiscalYearId))
    .where('Funding_Case_Agreement_Budget_Line_Item._deleted', '=', false)
    .orderBy('Funding_Case_Agreement_Budget_Line_Item.id', 'asc').limit(2).execute()
  if (sourceYears.length !== 2 || sourceCostLines.length !== 2) throw new Error('Source showcase agreement must have two fiscal years and two budget cost lines.')

  const budgetYears: Array<{ id: string, lineIds: [string, string] }> = []
  for (const [yearIndex, sourceYear] of sourceYears.entries()) {
    const year = await trx.insertInto('Funding_Case_Agreement_Budget_Fiscal_Year').values({
      egcs_fc_fundingagreement: agreementId,
      egcs_fc_fiscalyear: String(sourceYear.fiscalYearId), _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const yearId = String(year.id)
    const firstBudget = yearIndex === 0 ? '120000.00' : '150000.00'
    const secondBudget = yearIndex === 0 ? '40000.00' : '50000.00'
    const lines = await trx.insertInto('Funding_Case_Agreement_Budget_Line_Item').values([
      {
        egcs_fc_fundingagreementbudgetfiscalyear: yearId,
        egcs_fc_organizationcostcategory: String(sourceCostLines[0]!.costLineId),
        egcs_fc_costsubsection: 'Participant delivery',
        egcs_fc_description: `Participant support, community outreach, and service delivery in project year ${yearIndex + 1}.`,
        egcs_fc_totalamount: money(firstBudget), egcs_fc_programfunding: money(firstBudget),
        egcs_fc_currency: 'cad', egcs_fc_calculationmode: 'manual', _deleted: false
      },
      {
        egcs_fc_fundingagreementbudgetfiscalyear: yearId,
        egcs_fc_organizationcostcategory: String(sourceCostLines[1]!.costLineId),
        egcs_fc_costsubsection: 'Project operations',
        egcs_fc_description: `Equipment, coordination, accessibility, and reporting in project year ${yearIndex + 1}.`,
        egcs_fc_totalamount: money(secondBudget), egcs_fc_programfunding: money(secondBudget),
        egcs_fc_currency: 'cad', egcs_fc_calculationmode: 'manual', _deleted: false
      }
    ]).returning('id').execute()
    const lineIds: [string, string] = [String(lines[0]!.id), String(lines[1]!.id)]
    budgetYears.push({ id: yearId, lineIds })

    const forecast = await trx.insertInto('Funding_Case_Agreement_Forecast').values({
      egcs_fc_fundingagreement: agreementId, egcs_fc_fiscalyear: yearId,
      egcs_fc_status: status('Draft'), egcs_fc_active: false, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await addPrimaryAssignment(trx, 'fundingcaseforecast', String(forecast.id), userId)
    const forecastValues = yearForecasts[yearIndex]!
    await trx.insertInto('Funding_Case_Agreement_Forecast_Line_Item').values(
      forecastValues.flatMap((monthly, lineIndex) => monthly.map((amount, month) => ({
        egcs_fc_agreementforecast: String(forecast.id),
        egcs_fc_fundingagreementbudgetlineitem: lineIds[lineIndex]!,
        egcs_fc_month: month, egcs_fc_amount: money(`${amount}.00`),
        egcs_fc_currency: 'cad' as const, egcs_fc_version: '0', _deleted: false
      })))
    ).execute()
    await trx.updateTable('Funding_Case_Agreement_Forecast')
      .set({ egcs_fc_status: status('Active'), egcs_fc_active: true })
      .where('id', '=', String(forecast.id)).execute()
  }

  const claims = [
    { year: 0, start: 0, end: 3, received: '2025-08-12', amounts: ['22000.00', '6000.00'], reconciled: ['21000.00', '5500.00'] },
    { year: 0, start: 1, end: 2, received: '2025-07-18', amounts: ['14000.00', '4000.00'], reconciled: ['13000.00', '3500.00'] },
    { year: 0, start: 4, end: 6, received: '2025-11-10', amounts: ['35000.00', '10000.00'], reconciled: ['33000.00', '9000.00'] },
    { year: 0, start: 7, end: 9, received: '2026-02-12', amounts: ['28000.00', '7000.00'], reconciled: null },
    { year: 1, start: 0, end: 1, received: '2026-06-15', amounts: ['18000.00', '6000.00'], reconciled: ['17000.00', '5500.00'] }
  ] as const
  for (const [claimIndex, seedClaim] of claims.entries()) {
    const budgetYear = budgetYears[seedClaim.year]!
    const claim = await trx.insertInto('Funding_Case_Agreement_Claim').values({
      egcs_fc_fundingagreement: agreementId, egcs_fc_fiscalyear: budgetYear.id,
      egcs_fc_isfinalforyear: false,
      egcs_fc_periodstart: seedClaim.start, egcs_fc_periodend: seedClaim.end,
      egcs_fc_receiveddate: new Date(`${seedClaim.received}T00:00:00Z`),
      egcs_fc_status: status('Draft'), _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const claimId = String(claim.id)
    await addPrimaryAssignment(trx, 'fundingcaseagreementclaim', claimId, userId)
    await trx.updateTable('Funding_Case_Agreement_Claim').set({ egcs_fc_status: status('In Review') })
      .where('id', '=', claimId).execute()
    const lines = await trx.insertInto('Funding_Case_Agreement_Claim_Line_Item').values(
      seedClaim.amounts.map((amount, index) => ({
        egcs_fc_fundingagreementclaim: claimId,
        egcs_fc_fundingagreementbudgetlineitem: budgetYear.lineIds[index]!,
        egcs_fc_description: index === 0 ? 'Participant delivery costs submitted for the period.' : 'Project operations costs submitted for the period.',
        egcs_fc_amount: money(amount), egcs_fc_currency: 'cad' as const, _deleted: false
      }))
    ).returning('id').execute()
    if (!seedClaim.reconciled) continue
    const reconciliation = await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile').values({
      egcs_fc_fundingagreementclaim: claimId, egcs_fc_user: userId,
      egcs_fc_status: status('Draft'), egcs_fc_isfinal: true, _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    const reconciliationId = String(reconciliation.id)
    await addPrimaryAssignment(trx, 'fundingclaimreconcile', reconciliationId, userId)
    await trx.insertInto('Funding_Case_Agreement_Claim_Reconcile_Line_Item').values(
      seedClaim.reconciled.map((amount, index) => ({
        egcs_fc_fundingagreementclaimreconcile: reconciliationId,
        egcs_fc_lineitem: String(lines[index]!.id), egcs_fc_reconciled: money(amount), _deleted: false
      }))
    ).execute()
    await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile').set({ egcs_fc_status: status('Approved') })
      .where('id', '=', reconciliationId).execute()
    await trx.insertInto('Common_Completion').values({
      egcs_cn_entitytype: 'fundingclaimreconcile', egcs_cn_entityid: reconciliationId,
      egcs_cn_comments: `Illustrative approved reconciliation ${claimIndex + 1} for Financial Summary pacing.`,
      egcs_cn_user: userId, egcs_cn_disposition: 'no_workflow',
      egcs_cn_completedat: new Date(`${seedClaim.received}T12:00:00Z`), _deleted: false
    }).execute()
  }

  const sourceCommitment = await trx.selectFrom('Funding_Case_Agreement_Commitment')
    .select('egcs_fc_type')
    .where('egcs_fc_fundingagreement', '=', String(source.id)).where('_deleted', '=', false)
    .orderBy('id', 'asc').executeTakeFirstOrThrow()
  const chart = await trx.selectFrom('Transfer_Payment_Stream_Chart_of_Account').select('id')
    .where('egcs_tp_transferpaymentstream', '=', source.egcs_fc_transferpaymentstream)
    .where('_deleted', '=', false).orderBy('id', 'asc').executeTakeFirstOrThrow()
  const commitment = await trx.insertInto('Funding_Case_Agreement_Commitment').values({
    egcs_fc_fundingagreement: agreementId, egcs_fc_type: sourceCommitment.egcs_fc_type,
    egcs_fc_status: status('Draft'), egcs_fc_financialsystemnumber: '99000052',
    egcs_fc_active: false, _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  await addPrimaryAssignment(trx, 'fundingcaseagreementcommitment', String(commitment.id), userId)
  await trx.updateTable('Funding_Case_Agreement_Commitment')
    .set({ egcs_fc_status: status('Active'), egcs_fc_active: true })
    .where('id', '=', String(commitment.id)).execute()
  const commitmentLine = await trx.insertInto('Funding_Case_Agreement_Commitment_Line').values({
    egcs_fc_commitment: String(commitment.id), egcs_fc_commitmentlinenumber: 1,
    egcs_fc_transferpaymentstreamchartofaccount: String(chart.id), egcs_fc_amount: money('360000.00'), _deleted: false
  }).returning('id').executeTakeFirstOrThrow()
  const paymentSeeds = [
    { year: 0, start: 0, end: 2, amount: '22000.00' },
    { year: 0, start: 3, end: 5, amount: '35000.00' },
    { year: 0, start: 6, end: 8, amount: '25000.00' },
    { year: 1, start: 0, end: 2, amount: '15000.00' }
  ] as const
  for (const seedPayment of paymentSeeds) {
    const payment = await trx.insertInto('Funding_Case_Agreement_Payment').values({
      egcs_fc_fundingagreementcommitment: String(commitment.id),
      egcs_fc_fiscalyear: budgetYears[seedPayment.year]!.id,
      egcs_fc_paymenttype: 'reimbursement',
      egcs_fc_periodstart: seedPayment.start, egcs_fc_periodend: seedPayment.end,
      egcs_fc_paymentamount: money(seedPayment.amount), egcs_fc_currency: 'cad',
      egcs_fc_comment: 'Illustrative paid period for the Financial Summary showcase.',
      egcs_fc_status: status('Draft'), _deleted: false
    }).returning('id').executeTakeFirstOrThrow()
    await addPrimaryAssignment(trx, 'fundingcasepayment', String(payment.id), userId)
    await trx.insertInto('Funding_Case_Agreement_Payment_Line').values({
      egcs_fc_fundingagreementpayment: String(payment.id),
      egcs_fc_fundingagreementcommitmentline: String(commitmentLine.id),
      egcs_fc_amount: money(seedPayment.amount), _deleted: false
    }).execute()
    await trx.updateTable('Funding_Case_Agreement_Payment').set({ egcs_fc_status: status('Paid') })
      .where('id', '=', String(payment.id)).execute()
  }
  await addJuneOverlap(trx, agreementId, userId, status)
  return agreementId
}

try {
  const agreementId = await db.transaction().execute(seed)
  console.info(`Financial Summary sample agreement: ${agreementId} (/en/agreements/${agreementId})`)
} finally {
  await db.destroy()
}
