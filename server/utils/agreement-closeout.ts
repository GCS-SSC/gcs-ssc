/* eslint-disable jsdoc/require-jsdoc -- Closeout domain helpers are covered by executable tests and architecture documentation. */
import { createHash } from 'node:crypto'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Currency_Codes, Database, Entity_Type, JsonValue } from '~~/shared/types/database'
import type {
  AgreementCloseoutReadiness,
  CloseoutBlocker,
  CloseoutFinancialRow,
  CloseoutFinancialState
} from '~~/shared/types/agreement-closeout'
import { hasApprovedTargetEvidence } from '~~/server/utils/business-approval-evidence'
import { databaseMoneyText, parseDatabaseMoney } from '~~/server/utils/database-money'
import { addMoney, compareMoney, parseMoney, subtractMoney, type Money } from '~~/shared/utils/money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'

type DbClient = Kysely<Database> | Transaction<Database>

export const CLOSEOUT_SNAPSHOT_SCHEMA_VERSION = 1 as const
export const ACTIVE_CLOSEOUT_WORKFLOW_STATUSES = [
  'pending',
  'active',
  'awaiting_action',
  'paused'
] as const

export type AgreementCloseoutRuntimeContext = {
  closeoutId: string
  agreementId: string
  streamId: string
  agencyId: string
  isOpen: boolean
}

const ZERO_MONEY = parseMoney('0')

export const getCloseoutFinancialState = (variance: Money): CloseoutFinancialState => {
  if (compareMoney(variance, ZERO_MONEY) < 0) return 'outstanding_payment'
  if (compareMoney(variance, ZERO_MONEY) > 0) return 'outstanding_advance'
  return 'reconciled'
}

const closeoutRoute = (agreementId: string, segment: string, entityId: string): string => {
  if (segment === 'claim-reconciliations') return `/claim-reconciliations/${entityId}`
  return `/agreements/${agreementId}/${segment}/${entityId}`
}

const targetRoute = (agreementId: string, entityType: Entity_Type, entityId: string): string => {
  const segments: Partial<Record<Entity_Type, string>> = {
    fundingcaseagreementclaim: 'claims',
    fundingclaimreconcile: 'claim-reconciliations',
    fundingcasepayment: 'payments',
    fundingcaseforecast: 'forecasts',
    fundingcasemonitor: 'monitors',
    fundingcaseamendment: 'amendments',
    fundingcaseagreementcommitment: 'commitments'
  }
  const segment = segments[entityType]
  return segment ? closeoutRoute(agreementId, segment, entityId) : `/agreements/${agreementId}`
}

export const resolveAgreementCloseoutRuntimeContext = async (
  db: DbClient,
  closeoutId: string
): Promise<AgreementCloseoutRuntimeContext | null> => {
  if (!isPositivePostgresBigintText(closeoutId)) return null
  const row = await db.selectFrom('Funding_Case_Agreement_Closeout')
    .innerJoin('Funding_Case_Agreement_Profile', 'Funding_Case_Agreement_Profile.id', 'Funding_Case_Agreement_Closeout.egcs_fc_fundingagreement')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select([
      'Funding_Case_Agreement_Closeout.id as closeout_id',
      'Funding_Case_Agreement_Closeout.egcs_fc_isopen as is_open',
      'Funding_Case_Agreement_Profile.id as agreement_id',
      'Transfer_Payment_Stream.id as stream_id',
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id'
    ])
    .where('Funding_Case_Agreement_Closeout.id', '=', closeoutId)
    .where('Funding_Case_Agreement_Closeout._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .executeTakeFirst()
  return row
    ? {
        closeoutId: String(row.closeout_id), agreementId: String(row.agreement_id),
        streamId: String(row.stream_id), agencyId: String(row.agency_id), isOpen: row.is_open
      }
    : null
}

const buildFinancialReport = async (db: DbClient, agreementId: string) => {
  const [candidateClaimRows, paymentRows] = await Promise.all([
    db.selectFrom('Funding_Case_Agreement_Claim_Reconcile_Line_Item')
      .innerJoin('Funding_Case_Agreement_Claim_Reconcile', 'Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_fundingagreementclaimreconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .innerJoin('Funding_Case_Agreement_Claim_Line_Item', 'Funding_Case_Agreement_Claim_Line_Item.id', 'Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_lineitem')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .select([
        'Funding_Case_Agreement_Claim_Reconcile.id as reconcile_id',
        'Funding_Case_Agreement_Claim.egcs_fc_fiscalyear as fiscal_year_id',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year',
        'Funding_Case_Agreement_Claim_Line_Item.egcs_fc_currency as currency',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Claim_Reconcile_Line_Item.egcs_fc_reconciled')).as('amount')
      ])
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal', '=', true)
      .where('Funding_Case_Agreement_Claim_Reconcile_Line_Item._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim._deleted', '=', false)
      .where('Funding_Case_Agreement_Claim_Line_Item._deleted', '=', false)
      .execute(),
    db.selectFrom('Funding_Case_Agreement_Payment')
      .innerJoin('Common_Status', 'Common_Status.id', 'Funding_Case_Agreement_Payment.egcs_fc_status')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year', 'Funding_Case_Agreement_Budget_Fiscal_Year.id', 'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear')
      .innerJoin('Agency_Fiscal_Year', 'Agency_Fiscal_Year.id', 'Funding_Case_Agreement_Budget_Fiscal_Year.egcs_fc_fiscalyear')
      .select([
        'Funding_Case_Agreement_Payment.id as payment_id',
        'Funding_Case_Agreement_Payment.egcs_fc_fiscalyear as fiscal_year_id',
        'Agency_Fiscal_Year.egcs_ay_fiscalyeardisplay as fiscal_year',
        'Funding_Case_Agreement_Payment.egcs_fc_currency as currency',
        databaseMoneyText(sql.ref('Funding_Case_Agreement_Payment.egcs_fc_paymentamount')).as('amount'),
        'Common_Status.egcs_cn_terminal as status_terminal'
      ])
      .where('Funding_Case_Agreement_Payment.egcs_fc_fundingagreement', '=', agreementId)
      .where('Common_Status._deleted', '=', false)
      .where('Funding_Case_Agreement_Payment._deleted', '=', false)
      .execute()
  ])
  const claimRows = (await Promise.all(candidateClaimRows.map(async row =>
    await hasApprovedTargetEvidence(db, 'fundingclaimreconcile', String(row.reconcile_id)) ? row : null)))
    .filter((row): row is NonNullable<typeof row> => row !== null)
  const operationalPaymentRows = paymentRows.filter(row => row.status_terminal)

  type MutableFinancial = Omit<CloseoutFinancialRow, 'variance' | 'state'>
  const rows = new Map<string, MutableFinancial>()
  const readRow = (fiscalYearId: string, fiscalYear: string, currency: Currency_Codes): MutableFinancial => {
    const key = `${fiscalYearId}:${currency}`
    const current = rows.get(key) ?? { fiscalYearId, fiscalYear, currency, approvedClaimAmount: ZERO_MONEY, paidAmount: ZERO_MONEY }
    rows.set(key, current)
    return current
  }
  for (const row of claimRows) {
    const current = readRow(String(row.fiscal_year_id), row.fiscal_year, row.currency)
    current.approvedClaimAmount = addMoney(current.approvedClaimAmount, parseDatabaseMoney(row.amount))
  }
  for (const row of operationalPaymentRows) {
    const current = readRow(String(row.fiscal_year_id), row.fiscal_year, row.currency)
    current.paidAmount = addMoney(current.paidAmount, parseDatabaseMoney(row.amount))
  }

  const reportRows = [...rows.values()].map(row => {
    const { approvedClaimAmount, paidAmount } = row
    const variance = subtractMoney(paidAmount, approvedClaimAmount)
    return { ...row, approvedClaimAmount, paidAmount, variance, state: getCloseoutFinancialState(variance) }
  }).sort((left, right) => left.fiscalYear.localeCompare(right.fiscalYear) || left.currency.localeCompare(right.currency))

  const totalsByCurrency = new Map<Currency_Codes, { approvedClaimAmount: Money, paidAmount: Money }>()
  for (const row of reportRows) {
    const total = totalsByCurrency.get(row.currency) ?? { approvedClaimAmount: ZERO_MONEY, paidAmount: ZERO_MONEY }
    total.approvedClaimAmount = addMoney(total.approvedClaimAmount, row.approvedClaimAmount)
    total.paidAmount = addMoney(total.paidAmount, row.paidAmount)
    totalsByCurrency.set(row.currency, total)
  }
  const totals = [...totalsByCurrency].map(([currency, value]) => {
    const { approvedClaimAmount, paidAmount } = value
    const variance = subtractMoney(paidAmount, approvedClaimAmount)
    return { currency, approvedClaimAmount, paidAmount, variance, state: getCloseoutFinancialState(variance) }
  }).sort((left, right) => left.currency.localeCompare(right.currency))
  return { ready: totals.every(total => compareMoney(total.variance, ZERO_MONEY) === 0), rows: reportRows, totals }
}

const addBlocker = (
  blockers: CloseoutBlocker[], agreementId: string, entityType: Entity_Type,
  entityId: string, status: string, reason: string,
  labels: { en: string, fr: string } = { en: `#${entityId}`, fr: `#${entityId}` },
  category: CloseoutBlocker['category'] = 'child'
) => blockers.push({
  category,
  entityType,
  entityId,
  labelEn: labels.en,
  labelFr: labels.fr,
  status,
  reason,
  route: targetRoute(agreementId, entityType, entityId)
} as CloseoutBlocker)

export const buildAgreementCloseoutReadiness = async (
  db: DbClient,
  agreementId: string
): Promise<AgreementCloseoutReadiness | null> => {
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile')
    .select(['id', 'egcs_fc_status'])
    .where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirst()
  if (!agreement) return null

  const [financial, followupRows, amendments, claims, reconciles, payments, forecasts, monitors, commitments] = await Promise.all([
    buildFinancialReport(db, agreementId),
    db.selectFrom('Funding_Case_Agreement_Monitor_Followup')
      .innerJoin('Funding_Case_Agreement_Monitor', 'Funding_Case_Agreement_Monitor.id', 'Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor')
      .select([
        'Funding_Case_Agreement_Monitor_Followup.id', 'Funding_Case_Agreement_Monitor_Followup.egcs_fc_fundingagreementmonitor',
        'Funding_Case_Agreement_Monitor_Followup.egcs_fc_followupname', 'Funding_Case_Agreement_Monitor_Followup.egcs_fc_responsibleparty',
        'Funding_Case_Agreement_Monitor_Followup.egcs_fc_status', 'Funding_Case_Agreement_Monitor_Followup.egcs_fc_duedate'
      ])
      .where('Funding_Case_Agreement_Monitor.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Monitor_Followup.egcs_fc_status', 'in', ['open', 'onhold'])
      .where('Funding_Case_Agreement_Monitor_Followup._deleted', '=', false)
      .where('Funding_Case_Agreement_Monitor._deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Amendment').select([
      'id', 'egcs_fc_status', 'egcs_fc_isopen', 'egcs_fc_name_en', 'egcs_fc_name_fr'
    ])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Claim').select(['id', 'egcs_fc_status'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .select(['Funding_Case_Agreement_Claim_Reconcile.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_status', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_isfinal'])
      .where('Funding_Case_Agreement_Claim.egcs_fc_fundingagreement', '=', agreementId)
      .where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false).where('Funding_Case_Agreement_Claim._deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Payment').select(['id', 'egcs_fc_status'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Forecast').select(['id', 'egcs_fc_status'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Monitor').select(['id', 'egcs_fc_status'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute(),
    db.selectFrom('Funding_Case_Agreement_Commitment').select(['id', 'egcs_fc_status'])
      .where('egcs_fc_fundingagreement', '=', agreementId).where('_deleted', '=', false).execute()
  ])

  const blockers: CloseoutBlocker[] = []
  const configuredStatusIds = [...new Set([
    agreement.egcs_fc_status,
    ...amendments.map(row => row.egcs_fc_status),
    ...claims.map(row => row.egcs_fc_status),
    ...reconciles.map(row => row.egcs_fc_status),
    ...payments.map(row => row.egcs_fc_status),
    ...forecasts.map(row => row.egcs_fc_status),
    ...monitors.map(row => row.egcs_fc_status),
    ...commitments.map(row => row.egcs_fc_status)
  ])]
  const statusDefinitions = configuredStatusIds.length === 0
    ? []
    : await db.selectFrom('Common_Status').select(['id', 'egcs_cn_terminal'])
        .where('id', 'in', configuredStatusIds).where('_deleted', '=', false).execute()
  const terminalStatusIds = new Set(statusDefinitions.filter(status => status.egcs_cn_terminal).map(status => String(status.id)))
  const isTerminal = (statusId: string) => terminalStatusIds.has(statusId)
  if (isTerminal(agreement.egcs_fc_status)) {
    addBlocker(
      blockers, agreementId, 'fundingcaseagreement', agreementId, agreement.egcs_fc_status,
      'agreement_status', { en: `#${agreementId}`, fr: `#${agreementId}` }, 'agreement'
    )
  }
  for (const row of amendments) if (!isTerminal(row.egcs_fc_status) || row.egcs_fc_isopen) {
    addBlocker(
      blockers, agreementId, 'fundingcaseamendment', String(row.id), row.egcs_fc_status,
      'amendment_not_terminal', {
        en: row.egcs_fc_name_en ?? row.egcs_fc_name_fr ?? `#${row.id}`,
        fr: row.egcs_fc_name_fr ?? row.egcs_fc_name_en ?? `#${row.id}`
      }
    )
  }
  for (const row of claims) if (!isTerminal(row.egcs_fc_status)) {
    addBlocker(blockers, agreementId, 'fundingcaseagreementclaim', String(row.id), row.egcs_fc_status, 'claim_not_terminal')
  }
  for (const row of reconciles) if (!isTerminal(row.egcs_fc_status)) {
    addBlocker(blockers, agreementId, 'fundingclaimreconcile', String(row.id), row.egcs_fc_status, 'claim_reconcile_not_terminal')
  }
  for (const row of reconciles) if (row.egcs_fc_isfinal
    && !await hasApprovedTargetEvidence(db, 'fundingclaimreconcile', String(row.id))) {
    addBlocker(blockers, agreementId, 'fundingclaimreconcile', String(row.id), row.egcs_fc_status, 'claim_reconcile_approval_required')
  }
  for (const row of payments) if (!isTerminal(row.egcs_fc_status)) addBlocker(blockers, agreementId, 'fundingcasepayment', String(row.id), row.egcs_fc_status, 'payment_not_terminal')
  for (const row of forecasts) if (!isTerminal(row.egcs_fc_status)) addBlocker(blockers, agreementId, 'fundingcaseforecast', String(row.id), row.egcs_fc_status, 'forecast_not_terminal')
  for (const row of monitors) if (!isTerminal(row.egcs_fc_status)) addBlocker(blockers, agreementId, 'fundingcasemonitor', String(row.id), row.egcs_fc_status, 'monitor_not_terminal')
  for (const row of commitments) if (!isTerminal(row.egcs_fc_status)) addBlocker(blockers, agreementId, 'fundingcaseagreementcommitment', String(row.id), row.egcs_fc_status, 'commitment_not_terminal')

  const targets = [
    { entityType: 'fundingcaseagreement' as const, entityId: agreementId },
    ...amendments.map(row => ({ entityType: 'fundingcaseamendment' as const, entityId: String(row.id) })),
    ...claims.map(row => ({ entityType: 'fundingcaseagreementclaim' as const, entityId: String(row.id) })),
    ...reconciles.map(row => ({ entityType: 'fundingclaimreconcile' as const, entityId: String(row.id) })),
    ...payments.map(row => ({ entityType: 'fundingcasepayment' as const, entityId: String(row.id) })),
    ...forecasts.map(row => ({ entityType: 'fundingcaseforecast' as const, entityId: String(row.id) })),
    ...monitors.map(row => ({ entityType: 'fundingcasemonitor' as const, entityId: String(row.id) })),
    ...commitments.map(row => ({ entityType: 'fundingcaseagreementcommitment' as const, entityId: String(row.id) }))
  ]
  if (targets.length > 0) {
    const [activeRuns, activeReviewSets, activeRecommendationSets, activeRoutingSlips] = await Promise.all([
      db.selectFrom('Common_Runtime').select([
        'id', 'egcs_cn_entitytype', 'egcs_cn_entityid', 'egcs_cn_state as egcs_cn_status'
      ])
        .where('egcs_cn_kind', '=', 'workflow')
        .where('egcs_cn_state', 'in', [...ACTIVE_CLOSEOUT_WORKFLOW_STATUSES]).where('_deleted', '=', false)
        .where(eb => eb.or(targets.map(target => eb.and([
          eb('egcs_cn_entitytype', '=', target.entityType), eb('egcs_cn_entityid', '=', target.entityId)
        ])))).execute(),
      db.selectFrom('Common_Review_Set')
        .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Review_Set.egcs_cn_runtimeitem')
        .select([
          'Common_Review_Set.id', 'Common_Review_Set.egcs_cn_entitytype', 'Common_Review_Set.egcs_cn_entityid',
          'Common_Runtime_Item.egcs_cn_state as egcs_cn_status'
        ])
        .where('Common_Runtime_Item.egcs_cn_state', 'in', [...ACTIVE_CLOSEOUT_WORKFLOW_STATUSES])
        .where('Common_Review_Set._deleted', '=', false).where('Common_Runtime_Item._deleted', '=', false)
        .where(eb => eb.or(targets.map(target => eb.and([
          eb('Common_Review_Set.egcs_cn_entitytype', '=', target.entityType),
          eb('Common_Review_Set.egcs_cn_entityid', '=', target.entityId)
        ])))).execute(),
      db.selectFrom('Common_Recommendation_Set')
        .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Recommendation_Set.egcs_cn_runtimeitem')
        .select([
          'Common_Recommendation_Set.id', 'Common_Recommendation_Set.egcs_cn_entitytype',
          'Common_Recommendation_Set.egcs_cn_entityid', 'Common_Runtime_Item.egcs_cn_state as egcs_cn_status'
        ])
        .where('Common_Runtime_Item.egcs_cn_state', 'in', [...ACTIVE_CLOSEOUT_WORKFLOW_STATUSES])
        .where('Common_Recommendation_Set._deleted', '=', false).where('Common_Runtime_Item._deleted', '=', false)
        .where(eb => eb.or(targets.map(target => eb.and([
          eb('Common_Recommendation_Set.egcs_cn_entitytype', '=', target.entityType),
          eb('Common_Recommendation_Set.egcs_cn_entityid', '=', target.entityId)
        ])))).execute(),
      db.selectFrom('Common_Routing_Slip')
        .innerJoin('Common_Runtime_Item', 'Common_Runtime_Item.id', 'Common_Routing_Slip.egcs_cn_runtimeitem')
        .select([
          'Common_Routing_Slip.id', 'Common_Routing_Slip.egcs_cn_entitytype', 'Common_Routing_Slip.egcs_cn_entityid',
          'Common_Runtime_Item.egcs_cn_state as egcs_cn_status'
        ])
        .where('Common_Runtime_Item.egcs_cn_state', 'in', [...ACTIVE_CLOSEOUT_WORKFLOW_STATUSES])
        .where('Common_Routing_Slip._deleted', '=', false).where('Common_Runtime_Item._deleted', '=', false)
        .where(eb => eb.or(targets.map(target => eb.and([
          eb('Common_Routing_Slip.egcs_cn_entitytype', '=', target.entityType),
          eb('Common_Routing_Slip.egcs_cn_entityid', '=', target.entityId)
        ])))).execute()
    ])
    for (const row of activeRuns) addBlocker(
      blockers, agreementId, row.egcs_cn_entitytype, String(row.egcs_cn_entityid), row.egcs_cn_status,
      'workflow_active', { en: `Workflow #${row.id}`, fr: `Processus #${row.id}` }, 'workflow'
    )
    for (const row of activeReviewSets) addBlocker(
      blockers, agreementId, row.egcs_cn_entitytype, String(row.egcs_cn_entityid), row.egcs_cn_status,
      'review_active', { en: `Review set #${row.id}`, fr: `Ensemble de revues #${row.id}` }, 'workflow'
    )
    for (const row of activeRecommendationSets) addBlocker(
      blockers, agreementId, row.egcs_cn_entitytype, String(row.egcs_cn_entityid), row.egcs_cn_status,
      'recommendation_active', { en: `Recommendation set #${row.id}`, fr: `Ensemble de recommandations #${row.id}` }, 'workflow'
    )
    for (const row of activeRoutingSlips) addBlocker(
      blockers, agreementId, row.egcs_cn_entitytype, String(row.egcs_cn_entityid), row.egcs_cn_status,
      'approval_active', { en: `Approval #${row.id}`, fr: `Approbation #${row.id}` }, 'workflow'
    )
  }

  const outstandingFollowups = followupRows.map(row => ({
    id: String(row.id), monitorId: String(row.egcs_fc_fundingagreementmonitor), name: row.egcs_fc_followupname,
    responsibleParty: row.egcs_fc_responsibleparty, status: row.egcs_fc_status,
    dueDate: row.egcs_fc_duedate instanceof Date ? row.egcs_fc_duedate.toISOString().slice(0, 10) : String(row.egcs_fc_duedate),
    route: `/agreements/${agreementId}/monitors/${row.egcs_fc_fundingagreementmonitor}`
  }))
  return {
    schemaVersion: CLOSEOUT_SNAPSHOT_SCHEMA_VERSION,
    agreementId,
    agreementStatus: agreement.egcs_fc_status,
    agreementTerminal: isTerminal(agreement.egcs_fc_status),
    ready: financial.ready && outstandingFollowups.length === 0 && blockers.length === 0,
    financial,
    outstandingFollowups,
    blockers
  }
}

const normalizeForHash = (value: unknown): JsonValue => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForHash(item)]))
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

export const hashAgreementCloseoutSnapshot = (snapshot: AgreementCloseoutReadiness): string =>
  createHash('sha256').update(JSON.stringify(normalizeForHash(snapshot))).digest('hex')

const activeAgreementCloseoutWorkflowQuery = (db: DbClient, agreementId: string) => db
  .selectFrom('Funding_Case_Agreement_Closeout')
  .innerJoin('Common_Runtime', join => join
    .onRef('Common_Runtime.egcs_cn_entityid', '=', 'Funding_Case_Agreement_Closeout.id')
    .on('Common_Runtime.egcs_cn_entitytype', '=', 'fundingcaseagreementcloseout'))
  .innerJoin('Common_Workflow_Run', 'Common_Workflow_Run.id', 'Common_Runtime.id')
  .select('Common_Workflow_Run.id')
  .where('egcs_fc_fundingagreement', '=', agreementId)
  .where('Funding_Case_Agreement_Closeout._deleted', '=', false)
  .where('Common_Runtime.egcs_cn_state', 'in', [...ACTIVE_CLOSEOUT_WORKFLOW_STATUSES])
  .where('Common_Runtime._deleted', '=', false)

export const hasActiveAgreementCloseoutWorkflow = async (db: DbClient, agreementId: string): Promise<boolean> =>
  Boolean(await activeAgreementCloseoutWorkflowQuery(db, agreementId).executeTakeFirst())

/**
 * Detects an Agreement Closeout lock owned by a different Closeout.
 *
 * @param db Database connection or transaction.
 * @param agreementId Agreement aggregate identifier.
 * @param closeoutId Closeout allowed to own the current workflow lock.
 * @returns Whether a different Closeout owns an active workflow.
 */
export const hasCompetingAgreementCloseoutWorkflow = async (
  db: DbClient,
  agreementId: string,
  closeoutId: string
): Promise<boolean> => Boolean(await activeAgreementCloseoutWorkflowQuery(db, agreementId)
  .where('Funding_Case_Agreement_Closeout.id', '!=', closeoutId)
  .executeTakeFirst())
