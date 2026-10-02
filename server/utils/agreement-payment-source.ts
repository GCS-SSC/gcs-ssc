/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Public read contracts are documented at their authorization boundary. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'
import { resolveAgreementScopeContext } from './agreement'
import { authorize, authorizeWithFreshAuthContext, type AuthContext } from './authorize'
import { notFound } from './api-errors'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { escapeLikePattern } from './sql-like'
import type { AgreementScopeContext } from './agreement'

type PaymentSourceDb = Kysely<Database> | Transaction<Database>

/** The shared reader's source grant; callers must not reconstruct this policy. */
export const canReadAgreementPaymentSources = (auth: AuthContext, context: AgreementScopeContext): boolean =>
  auth.userAbilities.authorize('agreement', 'read', context.scope)

/** Authorizes lookup scope before eligibility, search, pagination or counts are extracted. */
export const requireAgreementPaymentSourceListRead = async (
  event: H3Event, db: PaymentSourceDb, agreementId: string, freshAuthContext?: AuthContext
) => {
  const context = await resolveAgreementScopeContext(agreementId, db)
  if (!context) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  if (freshAuthContext) await authorizeWithFreshAuthContext(event, freshAuthContext, 'agreement', 'read', context.scope)
  else await authorize(event, 'agreement', 'read', context.scope)
  return context
}

/** Lists finalized sources within the same authorized reader boundary as accounting extraction. */
export const listAgreementPaymentAccountingSources = async (
  event: H3Event, db: PaymentSourceDb,
  input: { agreementId: string; page: number; limit: number; search?: string },
  freshAuthContext?: AuthContext
) => {
  await requireAgreementPaymentSourceListRead(event, db, input.agreementId, freshAuthContext)
  let query = db.selectFrom('Funding_Case_Agreement_Payment as payment')
    .where('payment.egcs_fc_fundingagreement', '=', input.agreementId)
    .where(agreementPaymentIsFinal('payment', { requireResolvedApproval: true }))
  if (input.search) query = query.where(sql<boolean>`payment.id::text ILIKE ${`%${escapeLikePattern(input.search)}%`}`)
  const rows = await query.select(['payment.id', 'payment.egcs_fc_currency',
    databaseMoneyText(sql.ref('payment.egcs_fc_paymentamount')).as('egcs_fc_amount')])
    .orderBy('payment.id', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    label_en: `${row.id} · ${row.egcs_fc_amount} ${row.egcs_fc_currency.toUpperCase()}`,
    label_fr: `${row.id} · ${row.egcs_fc_amount} ${row.egcs_fc_currency.toUpperCase()}` })),
  total: Number(count.total), page: input.page, limit: input.limit }
}

/**
 * Resolves a Payment's canonical owner and enforces its normal scoped read grant.
 * @param event - Active request.
 * @param db - Database used to resolve current ownership.
 * @param paymentId - Source Payment identifier.
 * @param freshAuthContext - Already locked authorization context from a protected write.
 * @returns Authorized Payment ownership context.
 */
export const requireAgreementPaymentSourceRead = async (
  event: H3Event,
  db: PaymentSourceDb,
  paymentId: string,
  freshAuthContext?: AuthContext
) => {
  const payment = isPositivePostgresBigintText(paymentId)
    ? await db.selectFrom('Funding_Case_Agreement_Payment').select('egcs_fc_fundingagreement')
        .where('id', '=', paymentId).where('_deleted', '=', false).executeTakeFirst()
    : undefined
  const context = payment ? await resolveAgreementScopeContext(String(payment.egcs_fc_fundingagreement), db) : null
  if (!context) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  if (freshAuthContext) await authorizeWithFreshAuthContext(event, freshAuthContext, 'agreement', 'read', context.scope)
  else await authorize(event, 'agreement', 'read', context.scope)
  return context
}

/**
 * Reads source accounting data only after the Payment's own read authorization.
 * Historical catalog labels remain available after retirement. Protected callers
 * supply their locked fresh context instead of reusing request-cached grants.
 * @param event - Active request.
 * @param trx - Owning protected transaction.
 * @param paymentId - Source Payment identifier.
 * @param context - Locked Agreement and authorization context.
 * @param context.agreementId - Expected Agreement owner, resolved by the caller's transaction.
 * @param context.auth - Fresh authorization from that transaction.
 * @returns Source header and exact-money accounting allocations.
 */
export const readAgreementPaymentAccountingSource = async (
  event: H3Event,
  trx: Transaction<Database>,
  paymentId: string,
  context: { agreementId: string; auth: AuthContext }
) => {
  await requireAgreementPaymentSourceRead(event, trx, paymentId, context.auth)
  const header = await trx.selectFrom('Funding_Case_Agreement_Payment as p')
    .innerJoin('Common_Status as status', 'status.id', 'p.egcs_fc_status')
    .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as fy', 'fy.id', 'p.egcs_fc_fiscalyear')
    .innerJoin('Agency_Fiscal_Year as ay', 'ay.id', 'fy.egcs_fc_fiscalyear')
    .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'p.egcs_fc_fundingagreement')
    .select(['p.egcs_fc_currency', 'p.egcs_fc_fiscalyear', 'fy.egcs_fc_fiscalyear as egcs_fc_agencyfiscalyear',
      'ay.egcs_ay_fiscalyeardisplay as egcs_fc_fiscalyeardisplay', 'agreement.egcs_fc_agreementnumber'])
    .where('p.id', '=', paymentId).where('p.egcs_fc_fundingagreement', '=', context.agreementId)
    .where('p._deleted', '=', false).where('status._deleted', '=', false).forShare('p').executeTakeFirst()
  if (!header) return await notFound(event, 'AGREEMENT_PAYMENT_NOT_FOUND', 'apiErrors.agreement.payment_not_found')
  const rows = await trx.selectFrom('Funding_Case_Agreement_Payment_Line as l')
    .innerJoin('Funding_Case_Agreement_Commitment_Line as c', 'c.id', 'l.egcs_fc_fundingagreementcommitmentline')
    .innerJoin('Transfer_Payment_Stream_Chart_of_Account as s', 's.id', 'c.egcs_fc_transferpaymentstreamchartofaccount')
    .innerJoin('Agency_Chart_of_Account as a', 'a.id', 's.egcs_tp_agencychartofaccount')
    .select(['c.id as egcs_fc_commitmentline', 'c.egcs_fc_commitmentlinenumber', 's.id as egcs_fc_chartofaccount',
      'a.egcs_ay_accountingdimensions as egcs_fc_accountingdimensions', databaseMoneyText(sql.ref('l.egcs_fc_amount')).as('egcs_fc_amount')])
    .where('l.egcs_fc_fundingagreementpayment', '=', paymentId).where('l._deleted', '=', false)
    .orderBy('c.id').forShare('l').execute()
  return { header, allocations: rows.map(row => ({ ...row, egcs_fc_amount: parseDatabaseMoney(row.egcs_fc_amount),
    egcs_fc_accountingdimensions: TransferPaymentStreamChartOfAccountDimensionSchema.array().parse(row.egcs_fc_accountingdimensions) })) }
}

/**
 * SQL predicate for a finalized source Payment, applied before lookup pagination
 * and again inside the protected creation/routing transaction. Legacy terminal
 * Payments without Completion remain eligible. Retained negative approval and
 * unfinished Completion evidence cannot become an accounting baseline.
 * @param paymentAlias - Trusted query alias for the Payment table.
 * @param options - Whether retained target approval evidence must be resolved positively.
 * @param options.requireResolvedApproval - Strict source eligibility for Corrections; existing JV callers retain their policy.
 * @returns A predicate using the ordinary status and shared lifecycle evidence.
 */
export const agreementPaymentIsFinal = (paymentAlias: string, options: { requireResolvedApproval?: boolean } = {}) => {
  const paymentId = sql.ref(`${paymentAlias}.id`)
  return sql<boolean>`
    EXISTS (
      SELECT 1 FROM "Common_Status" AS source_status
      WHERE source_status.id = ${sql.ref(`${paymentAlias}.egcs_fc_status`)}
        AND source_status.egcs_cn_terminal = TRUE AND source_status._deleted = FALSE
    )
    AND ${sql.ref(`${paymentAlias}._deleted`)} = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM "Common_Completion" AS source_completion
      WHERE source_completion.egcs_cn_entitytype = 'fundingcasepayment'
        AND source_completion.egcs_cn_entityid = ${paymentId} AND source_completion._deleted = FALSE
        AND source_completion.egcs_cn_disposition <> 'no_workflow'
        AND COALESCE((
          SELECT source_runtime.egcs_cn_state IN ('succeeded', 'approved')
          FROM "Common_Workflow_Run" AS source_run
          INNER JOIN "Common_Runtime" AS source_runtime ON source_runtime.id = source_run.id
          WHERE source_run.egcs_cn_completion = source_completion.id AND source_runtime._deleted = FALSE
          ORDER BY source_runtime.egcs_cn_attempt DESC, source_runtime.id DESC LIMIT 1
        ), FALSE) = FALSE
    )
    AND ${agreementPaymentApprovalIsEligible(paymentAlias, options)}
  `
}

/** Retained target approval eligibility without requiring a Completion record. */
export const agreementPaymentApprovalIsEligible = (paymentAlias: string, options: { requireResolvedApproval?: boolean } = {}) =>
  sql<boolean>`COALESCE((
      SELECT ${options.requireResolvedApproval
        ? sql<boolean>`source_item.egcs_cn_state IN ('succeeded', 'approved')`
        : sql<boolean>`source_item.egcs_cn_state NOT IN ('denied', 'unsuccessful', 'cancelled', 'failed')`}
      FROM "Common_Routing_Slip" AS source_slip
      INNER JOIN "Common_Runtime_Item" AS source_item ON source_item.id = source_slip.egcs_cn_runtimeitem
      INNER JOIN "Common_Runtime" AS source_runtime ON source_runtime.id = source_item.egcs_cn_runtime
      WHERE source_slip.egcs_cn_entitytype = 'fundingcasepayment' AND source_slip.egcs_cn_entityid = ${sql.ref(`${paymentAlias}.id`)}
        AND source_slip._deleted = FALSE AND source_item._deleted = FALSE AND source_runtime._deleted = FALSE
        AND source_item.egcs_cn_parentruntimeitem IS NULL
      ORDER BY source_runtime.id DESC, source_slip.id DESC LIMIT 1
    ), TRUE)`
