/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- Explicit AR ownership and protected multi-Agreement transaction contracts. */
import type { H3Event } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import type { Database, Currency_Codes } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveAgreementScopeContext } from './agreement'
import { authorizeFreshAssignedItem, requireFreshAuthContext, type AuthContext } from './authorize'
import { forbidden, notFound } from './api-errors'
import { lockRegisteredExtensionAgreementScopes, lockRegisteredExtensionAgreementLifecycle } from './extensions'
import { lockTransferPaymentStreams } from './transfer-payment-stream-lock'
import { assertAgreementCorrectionFinancialWriteAllowed } from './correction-lock'
import { withAuditExecution } from './audit-context'

export type AccountReceivablePoolIdentity = { agencyId: string; applicantRecipientId: string; currency: Currency_Codes }
export type AccountReceivableCaseType = 'fundingcaseaccountreceivable' | 'fundingcaseaccountreceivablecreditmemo'

export const resolveAccountReceivableRuntimeContext = async (db: Kysely<Database>, id: string) => {
  if (!isPositivePostgresBigintText(id)) return null
  const row = await db.selectFrom('Funding_Case_Agreement_Account_Receivable').selectAll()
    .where('id', '=', id).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return null
  const context = await resolveAgreementScopeContext(String(row.egcs_fc_fundingagreement), db)
  return context
    ? { ...context, receivableId: id, poolId: String(row.egcs_fc_pool),
        applicantRecipientId: String(row.egcs_fc_applicantrecipient), currency: row.egcs_fc_currency }
    : null
}

export const resolveAccountReceivableCreditMemoRuntimeContext = async (db: Kysely<Database>, id: string) => {
  if (!isPositivePostgresBigintText(id)) return null
  const row = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo').selectAll()
    .where('id', '=', id).where('_deleted', '=', false).executeTakeFirst()
  if (!row) return null
  const agencyId = String(row.egcs_fc_agency)
  const pool = await db.selectFrom('Funding_Case_Account_Receivable_Pool as pool')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'pool.egcs_fc_agency')
    .innerJoin('Applicant_Recipient_Profile as proponent', 'proponent.id', 'pool.egcs_fc_applicantrecipient')
    .select('pool.id').where('pool.id', '=', String(row.egcs_fc_pool))
    .where('pool.egcs_fc_agency', '=', agencyId).where('pool.egcs_fc_applicantrecipient', '=', String(row.egcs_fc_applicantrecipient))
    .where('pool.egcs_fc_currency', '=', row.egcs_fc_currency)
    .where('pool._deleted', '=', false).where('agency._deleted', '=', false).where('proponent._deleted', '=', false).executeTakeFirst()
  if (!pool) return null
  // The old Agreement is retained provenance, never the memo's current owner.
  const historicalContext = row.egcs_fc_fundingagreement ? await resolveAgreementScopeContext(String(row.egcs_fc_fundingagreement), db) : null
  const context = historicalContext?.agencyId === agencyId ? historicalContext : null
  return { agreementId: context?.agreementId, streamId: context?.streamId, profileId: context?.profileId,
    agencyId, scope: { type: 'agency' as const, agencyId }, creditMemoId: id, poolId: String(row.egcs_fc_pool),
    applicantRecipientId: String(row.egcs_fc_applicantrecipient), currency: row.egcs_fc_currency,
    agreementIds: [] as string[] }
}

/** Called before any Agreement lock; the pool serializes recovery and debt policy changes. */
export const lockAccountReceivableRecoveryPool = async (trx: Transaction<Database>, identity: AccountReceivablePoolIdentity) => {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gcs-ar:${identity.agencyId}:${identity.applicantRecipientId}`},0))`.execute(trx)
  await trx.insertInto('Funding_Case_Account_Receivable_Pool').values({ egcs_fc_agency: identity.agencyId,
    egcs_fc_applicantrecipient: identity.applicantRecipientId, egcs_fc_currency: identity.currency })
    .onConflict(conflict => conflict.columns(['egcs_fc_agency', 'egcs_fc_applicantrecipient', 'egcs_fc_currency']).doNothing()).execute()
  return await trx.selectFrom('Funding_Case_Account_Receivable_Pool').selectAll()
    .where('egcs_fc_agency', '=', identity.agencyId).where('egcs_fc_applicantrecipient', '=', identity.applicantRecipientId)
    .where('egcs_fc_currency', '=', identity.currency).forUpdate().executeTakeFirstOrThrow()
}

/** Engine lock plan covers every originating debtor Agreement, in canonical numeric ID order. */
export const lockAccountReceivablePaymentPoolAgreements = async (
  trx: Transaction<Database>, identity: AccountReceivablePoolIdentity & { agreementId: string }
) => {
  const pool = await lockAccountReceivableRecoveryPool(trx, identity)
  const debts = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable')
    .select('egcs_fc_fundingagreement').where('egcs_fc_pool', '=', String(pool.id)).where('_deleted', '=', false).execute()
  const agreementIds = [...new Set([identity.agreementId, ...debts.map(row => String(row.egcs_fc_fundingagreement))])]
  await trx.selectFrom('Funding_Case_Agreement_Profile').select('id').where('id', 'in', agreementIds)
    .where('_deleted', '=', false).orderBy('id').forUpdate().execute()
  const { assertAgreementCorrectionFinancialUnlocked } = await import('./correction-lock')
  for (const id of agreementIds) await assertAgreementCorrectionFinancialUnlocked(trx, id)
  return { pool, agreementIds }
}

export const executeFreshAccountReceivableWrite = async <T>(
  event: H3Event, identity: AccountReceivablePoolIdentity & { agreementIds: string[] },
  callback: (trx: Transaction<Database>, auth: AuthContext, poolId: string) => Promise<T>,
  options: { action?: 'create' | 'update' | 'delete'; target?: { entityType: AccountReceivableCaseType; entityId: string }; sourceRead?: boolean } = {}
): Promise<T> => {
  const initial = await Promise.all(identity.agreementIds.map(id => resolveAgreementScopeContext(id, event.context.$db)))
  if (initial.some(context => !context || context.agencyId !== identity.agencyId)) return await notFound(event, 'ACCOUNT_RECEIVABLE_NOT_FOUND', 'apiErrors.account_receivable.not_found')
  return await event.context.$db.transaction().execute(async trx => {
    const auth = await requireFreshAuthContext(event, trx)
    if (!identity.agreementIds.length && !auth.userAbilities.authorize('account_receivable', options.action ?? 'update', { type: 'agency', agencyId: identity.agencyId })) return await forbidden(event)
    const streams = [...new Set(initial.flatMap(context => context ? [context.streamId] : []))]
    await lockRegisteredExtensionAgreementScopes(trx, identity.agencyId, streams)
    const agency = await trx.selectFrom('Agency_Profile').select('id').where('id', '=', identity.agencyId)
      .where('_deleted', '=', false).forShare().executeTakeFirst()
    if (!agency || (await lockTransferPaymentStreams(trx, streams)).size !== streams.length) return await forbidden(event)
    const pool = await lockAccountReceivableRecoveryPool(trx, identity)
    // Lock all debt Agreements too: a later offset can never invert origin and paying locks.
    const poolDebts = await trx.selectFrom('Funding_Case_Agreement_Account_Receivable').select('egcs_fc_fundingagreement')
      .where('egcs_fc_pool', '=', String(pool.id)).where('_deleted', '=', false).execute()
    const lockIds = [...new Set([...identity.agreementIds, ...poolDebts.map(row => String(row.egcs_fc_fundingagreement))])]
    if (lockIds.length) await trx.selectFrom('Funding_Case_Agreement_Profile').select('id').where('id', 'in', lockIds).orderBy('id').forUpdate().execute()
    for (let index = 0; index < identity.agreementIds.length; index += 1) {
      const id = identity.agreementIds[index]!
      const context = await resolveAgreementScopeContext(id, trx)
      const before = initial[index]!
      if (!context || context.agencyId !== identity.agencyId || context.streamId !== before!.streamId || context.profileId !== before!.profileId) return await forbidden(event)
      if (!auth.userAbilities.authorize('account_receivable', options.action ?? 'update', context.scope)) return await forbidden(event)
      if (options.sourceRead && !auth.userAbilities.authorize('agreement', 'read', context.scope)) return await forbidden(event)
      await lockRegisteredExtensionAgreementLifecycle(event, trx, { agreementId: id, agencyId: context.agencyId,
        currentStreamId: context.streamId, targetStreamIds: [context.streamId] })
      await assertAgreementCorrectionFinancialWriteAllowed(event, trx, id)
      const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', id).executeTakeFirstOrThrow()
      if (agreement.egcs_fc_currency !== identity.currency) return await forbidden(event)
    }
    if (options.target) await authorizeFreshAssignedItem(event, trx, auth, options.target.entityType, options.target.entityId, options.action ?? 'update')
    return await withAuditExecution({ type: 'agency', agencyId: identity.agencyId }, () => callback(trx, auth, String(pool.id)))
  })
}

/** Claim keys remain unique; fiscal advance consumption belongs to its explicit debtor. */
export const accountReceivableSourceUsage = (agreementId: string, sourceKey: string, excludedId?: string, options: { applicantRecipientId?: string } = {}) => sql<string>`(
  SELECT (COALESCE(SUM(CASE WHEN debt.egcs_fc_outcome = 'posted' THEN line.egcs_fc_amount ELSE greatest(line.egcs_fc_amount,0) END),0) - CASE WHEN ${sourceKey.startsWith('advance:')} THEN COALESCE((
    SELECT SUM(allocation.egcs_fc_amount)
    FROM "Funding_Case_Account_Receivable_Allocation" allocation
    JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
    JOIN "Funding_Case_Agreement_Account_Receivable_Line" source ON source.id = allocation.egcs_fc_receivableline
    JOIN "Funding_Case_Agreement_Account_Receivable" source_debt ON source_debt.id = source.egcs_fc_receivable
    WHERE source.egcs_fc_sourcekey = ${sourceKey} AND source.egcs_fc_fundingagreement = ${agreementId}
      AND recovery.egcs_fc_outcome = 'posted' AND NOT recovery._deleted AND NOT allocation._deleted
      ${sourceKey.startsWith('advance:') && options.applicantRecipientId ? sql`AND source_debt.egcs_fc_applicantrecipient = ${options.applicantRecipientId}` : sql``}
  ),0) ELSE 0 END)::text
  FROM "Funding_Case_Agreement_Account_Receivable_Line" line
  JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id = line.egcs_fc_receivable
  WHERE line.egcs_fc_fundingagreement = ${agreementId} AND line.egcs_fc_sourcekey = ${sourceKey}
    AND NOT line._deleted AND NOT debt._deleted AND debt.egcs_fc_outcome IN ('open','posted')
    ${sourceKey.startsWith('advance:') && options.applicantRecipientId ? sql`AND debt.egcs_fc_applicantrecipient = ${options.applicantRecipientId}` : sql``}
    ${excludedId ? sql`AND debt.id <> ${excludedId}` : sql``}
)`

export const accountReceivableAdvanceUsage = (agreementId: string, applicantRecipientId: string, agencyFiscalYearId: string, excludedId?: string) => sql<string>`(
  SELECT (COALESCE(SUM(CASE WHEN debt.egcs_fc_outcome = 'posted' THEN line.egcs_fc_amount ELSE greatest(line.egcs_fc_amount,0) END),0) - COALESCE((
    SELECT SUM(allocation.egcs_fc_amount)
    FROM "Funding_Case_Account_Receivable_Allocation" allocation
    JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id = allocation.egcs_fc_recovery
    JOIN "Funding_Case_Agreement_Account_Receivable" source_debt ON source_debt.id = allocation.egcs_fc_receivable
    WHERE source_debt.egcs_fc_fundingagreement = ${agreementId} AND source_debt.egcs_fc_applicantrecipient = ${applicantRecipientId}
      AND source_debt.egcs_fc_agencyfiscalyear = ${agencyFiscalYearId} AND source_debt.egcs_fc_advancepaymentrelated
      AND recovery.egcs_fc_outcome = 'posted' AND NOT recovery._deleted AND NOT allocation._deleted
  ),0))::text
  FROM "Funding_Case_Agreement_Account_Receivable_Line" line
  JOIN "Funding_Case_Agreement_Account_Receivable" debt ON debt.id = line.egcs_fc_receivable
  WHERE debt.egcs_fc_fundingagreement = ${agreementId} AND debt.egcs_fc_applicantrecipient = ${applicantRecipientId}
    AND debt.egcs_fc_agencyfiscalyear = ${agencyFiscalYearId} AND debt.egcs_fc_advancepaymentrelated
    AND NOT line._deleted AND NOT debt._deleted AND debt.egcs_fc_outcome IN ('open','posted')
    ${excludedId ? sql`AND debt.id <> ${excludedId}` : sql``}
)`
