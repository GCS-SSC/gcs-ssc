/* eslint-disable jsdoc/require-jsdoc -- Proponent projections reuse existing financial scope grants in one fresh snapshot. */
import type { H3Event } from 'h3'
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { ProponentAccountReceivableRow, ProponentCreditMemoRow, ProponentCreditMemoApplication, ProponentAccountBalanceRow } from '~~/shared/types/account-receivable-proponent'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { sumMoney } from '~~/shared/utils/money'
import { authorize, requireAuthContext, type AuthContext } from './authorize'
import { notFound } from './api-errors'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { assertApplicantRecipientProfileExists } from './applicant-recipient-child-resources'
import { executeFreshReadSnapshot } from './fresh-read-snapshot'
import { resolveAgreementScopeContext } from './agreement'
import { readAccountReceivableLines, readAccountReceivableApprovedRecoveryMethod } from './account-receivable'
import { readAccountReceivableOffsetMemos } from './account-receivable-offset-memo'
import { readAccountReceivablePoolBalance } from './account-receivable-pool-ledger'
import { databaseMoneyText, parseDatabaseMoney } from './database-money'
import { escapeLikePattern } from './sql-like'
import { getValidatedQueryI18n } from './api-validate'
import { PaginationSchema } from '~~/shared/types/schemas'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'

const ZERO = parseDatabaseMoney('0.00')
type ListInput = { page: number; limit: number; search?: string }
const pageResult = <Row>(items: Row[], total: number, input: ListInput) => ({ items, total, page: input.page, limit: input.limit })
const isoDate = (value: Date | string) => new Date(value).toISOString()

const authorizeProponent = async (event: H3Event, id: string) => {
  if (!isPositivePostgresBigintText(id)) return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  const auth = await authorize(event, 'applicant_recipient', 'read', async ({ context }) =>
    await canAccessApplicantRecipient(context, id, 'read', event.context.$db)
      ? { bypass: true as const }
      : { denied: true as const })
  await assertApplicantRecipientProfileExists(event, id, event.context.$db)
  return auth
}

const financialAgencies = async (db: Kysely<Database>, auth: AuthContext, action: 'read' | 'create') => {
  let query = db.selectFrom('Agency_Profile').select(['id', 'egcs_ay_name_en', 'egcs_ay_name_fr']).where('_deleted', '=', false)
  if (action === 'create') query = query.where('egcs_ay_active', '=', true)
  const agencies = await query.orderBy('egcs_ay_name_en').orderBy('id').execute()
  return agencies.filter(agency => auth.userAbilities.authorize('account_receivable', action, { type: 'agency', agencyId: String(agency.id) }))
}

const hasActiveProponent = async (db: Kysely<Database>, id: string) => Boolean(await db
  .selectFrom('Applicant_Recipient_Profile').select('id').where('id', '=', id)
  .where('egcs_ar_active', '=', true).where('_deleted', '=', false).executeTakeFirst())

const agreementReader = (db: Kysely<Database>, auth: AuthContext, subject: 'account_receivable' | 'agreement' = 'account_receivable') => {
  const owners = new Map<string, Promise<Awaited<ReturnType<typeof resolveAgreementScopeContext>>>>()
  return async (agreementId: string) => {
    let pendingOwner = owners.get(agreementId)
    if (!pendingOwner) {
      pendingOwner = resolveAgreementScopeContext(agreementId, db)
      owners.set(agreementId, pendingOwner)
    }
    const owner = await pendingOwner
    return owner && auth.userAbilities.authorize(subject, 'read', owner.scope) ? owner : null
  }
}

export const listProponentAccountReceivables = async (event: H3Event, id: string, requestedInput?: ListInput) => {
  await requireAuthContext(event)
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeProponent(event, id)
    const input = requestedInput ?? await getValidatedQueryI18n(event, PaginationSchema)
    const readOwner = agreementReader(db, auth)
    let query = db.selectFrom('Funding_Case_Agreement_Account_Receivable')
      .select(['id', 'egcs_fc_fundingagreement'])
      .where('egcs_fc_applicantrecipient', '=', id).where('_deleted', '=', false)
    if (input.search) {
      const search = `%${escapeLikePattern(input.search)}%`
      query = query.where(eb => eb.or([
        eb('egcs_fc_agreementnumber', 'ilike', search),
        eb('egcs_fc_narrative_en', 'ilike', search), eb('egcs_fc_narrative_fr', 'ilike', search),
        eb('egcs_fc_typename_en', 'ilike', search), eb('egcs_fc_typename_fr', 'ilike', search),
        sql<boolean>`(${sql.ref('egcs_fc_agreementnumber')} || ' / AR ' || ${sql.ref('egcs_fc_number')}::text) ILIKE ${search}`
      ]))
    }
    const candidates = await query.orderBy('egcs_fc_createdat', 'desc').orderBy('id', 'desc').execute()
    const accessible = await Promise.all(candidates.map(async row =>
      await readOwner(String(row.egcs_fc_fundingagreement)) ? row : null))
    const visible = accessible.filter(row => row !== null)
    const page = visible.slice((input.page - 1) * input.limit, input.page * input.limit)
    const items: ProponentAccountReceivableRow[] = await Promise.all(page.map(async row => {
      const header = await db.selectFrom('Funding_Case_Agreement_Account_Receivable')
        .select(['id', 'egcs_fc_fundingagreement', 'egcs_fc_agreementnumber', 'egcs_fc_number', 'egcs_fc_linkedreceivable',
          'egcs_fc_status', 'egcs_fc_currency', 'egcs_fc_typename_en', 'egcs_fc_typename_fr', 'egcs_fc_outcome'])
        .where('id', '=', String(row.id)).where('_deleted', '=', false).executeTakeFirstOrThrow()
      const lines = await readAccountReceivableLines(db, String(header.id))
      const labels = lines[0]?.egcs_fc_evidence
      const fiscalYear = labels && typeof labels === 'object' && !Array.isArray(labels) && 'egcs_fc_fiscalyeardisplay' in labels
        ? String(labels.egcs_fc_fiscalyeardisplay ?? '')
        : ''
      const amount = sumMoney(lines.map(line => line.egcs_fc_amount))
      return {
        id: String(header.id), egcs_fc_fundingagreement: String(header.egcs_fc_fundingagreement),
        egcs_fc_agreementnumber: header.egcs_fc_agreementnumber, egcs_fc_number: header.egcs_fc_number,
        egcs_fc_linkedreceivable: header.egcs_fc_linkedreceivable ? String(header.egcs_fc_linkedreceivable) : null,
        egcs_fc_status: String(header.egcs_fc_status), egcs_fc_currency: header.egcs_fc_currency,
        egcs_fc_typename_en: header.egcs_fc_typename_en, egcs_fc_typename_fr: header.egcs_fc_typename_fr,
        egcs_fc_fiscalyeardisplay: fiscalYear, egcs_fc_originalamount: amount,
        egcs_fc_approvedamount: header.egcs_fc_outcome === 'posted' ? amount : ZERO,
        egcs_fc_effectiverecoverymethod: await readAccountReceivableApprovedRecoveryMethod(db, String(header.id))
      }
    }))
    return pageResult(items, visible.length, input)
  })
}

const readOffsetMemoRows = async (db: Kysely<Database>, id: string,
  agencies: Awaited<ReturnType<typeof financialAgencies>>, auth: AuthContext): Promise<ProponentCreditMemoRow[]> => {
  if (!agencies.length) return []
  const pools = await db.selectFrom('Funding_Case_Account_Receivable_Pool')
    .select(['id', 'egcs_fc_agency', 'egcs_fc_currency']).where('egcs_fc_applicantrecipient', '=', id)
    .where('egcs_fc_agency', 'in', agencies.map(agency => String(agency.id))).where('_deleted', '=', false).execute()
  const memos = await readAccountReceivableOffsetMemos(db, pools.map(pool => String(pool.id)))
  const poolById = new Map(pools.map(pool => [String(pool.id), pool]))
  const agencyById = new Map(agencies.map(agency => [String(agency.id), agency]))
  const paymentIds = [...new Set(memos.flatMap(memo => memo.egcs_fc_applications.map(application => application.egcs_fc_payment)))]
  const payments = paymentIds.length
    ? await db.selectFrom('Funding_Case_Agreement_Payment as payment')
        .innerJoin('Funding_Case_Agreement_Commitment as commitment', 'commitment.id', 'payment.egcs_fc_fundingagreementcommitment')
        .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'commitment.egcs_fc_fundingagreement')
        .select(['payment.id', 'agreement.id as egcs_fc_fundingagreement', 'agreement.egcs_fc_agreementnumber'])
        .where('payment.id', 'in', paymentIds).where('payment._deleted', '=', false)
        .where('commitment._deleted', '=', false).where('agreement._deleted', '=', false).execute()
    : []
  const readOwner = agreementReader(db, auth, 'agreement')
  const authorizedPayments = await Promise.all(payments.map(async payment =>
    await readOwner(String(payment.egcs_fc_fundingagreement)) ? payment : null))
  const paymentById = new Map(authorizedPayments.filter(payment => payment !== null).map(payment => [String(payment.id), payment]))
  return memos.flatMap(memo => {
    const pool = poolById.get(String(memo.egcs_fc_pool))
    const agency = pool ? agencyById.get(String(pool.egcs_fc_agency)) : undefined
    if (!pool || !agency) return []
    const applications: ProponentCreditMemoApplication[] = memo.egcs_fc_applications.flatMap(application => {
      const payment = paymentById.get(application.egcs_fc_payment)
      if (!payment) return []
      return [{ ...application, egcs_fc_fundingagreement: String(payment.egcs_fc_fundingagreement),
        egcs_fc_agreementnumber: payment.egcs_fc_agreementnumber }]
    })
    // Select the immutable first application before filtering; later readable Payments are never substituted for its origin.
    const originId = memo.egcs_fc_applications[0]?.id
    return {
      id: String(memo.id), egcs_fc_kind: 'automatic' as const, egcs_fc_status: null,
      egcs_fc_creditmemoreference: memo.egcs_fc_creditmemoreference, egcs_fc_agency: String(agency.id),
      egcs_fc_agencyname_en: agency.egcs_ay_name_en, egcs_fc_agencyname_fr: agency.egcs_ay_name_fr,
      egcs_fc_currency: pool.egcs_fc_currency, egcs_fc_amount: memo.egcs_fc_appliedamount,
      egcs_fc_receivableoutstanding: memo.egcs_fc_receivableoutstanding, egcs_fc_createdat: memo.egcs_fc_createdat,
      egcs_fc_originapplication: applications.find(application => application.id === originId) ?? null,
      egcs_fc_applications: applications
    }
  })
}

export const listProponentCreditMemos = async (event: H3Event, id: string, requestedInput?: ListInput) => {
  await requireAuthContext(event)
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeProponent(event, id)
    const input = requestedInput ?? await getValidatedQueryI18n(event, PaginationSchema)
    const [agencies, createAgencies] = await Promise.all([financialAgencies(db, auth, 'read'), financialAgencies(db, auth, 'create')])
    const canCreate = createAgencies.length > 0 && await hasActiveProponent(db, id)
    if (!agencies.length) return { ...pageResult<ProponentCreditMemoRow>([], 0, input), egcs_fc_cancreate: canCreate }
    const agencyById = new Map(agencies.map(agency => [String(agency.id), agency]))
    const cash = await db.selectFrom('Funding_Case_Account_Receivable_Credit_Memo as memo')
      .select(['memo.id', 'memo.egcs_fc_number', 'memo.egcs_fc_agency', 'memo.egcs_fc_currency', 'memo.egcs_fc_status',
        'memo.egcs_fc_receiveddate', 'memo.egcs_fc_receiptreference', 'memo.egcs_fc_createdat'])
      .select(databaseMoneyText(sql.ref('memo.egcs_fc_amount')).as('egcs_fc_amount'))
      .where('memo.egcs_fc_applicantrecipient', '=', id).where('memo.egcs_fc_agency', 'in', [...agencyById.keys()])
      .where('memo._deleted', '=', false).execute()
    const cashRows: ProponentCreditMemoRow[] = await Promise.all(cash.map(async memo => {
      const agency = agencyById.get(String(memo.egcs_fc_agency))
      if (!agency) throw new Error('CREDIT_MEMO_OWNER_CHANGED')
      const legacyRecovery = await db.selectFrom('Funding_Case_Account_Receivable_Recovery').select('id')
        .where('egcs_fc_creditmemo', '=', String(memo.id)).where('_deleted', '=', false).orderBy('id', 'desc').executeTakeFirst()
      return {
        id: String(memo.id), egcs_fc_kind: 'cash' as const, egcs_fc_status: String(memo.egcs_fc_status),
        egcs_fc_creditmemoreference: `CM-${legacyRecovery?.id ?? memo.id}`,
        egcs_fc_agency: String(agency.id), egcs_fc_agencyname_en: agency.egcs_ay_name_en, egcs_fc_agencyname_fr: agency.egcs_ay_name_fr,
        egcs_fc_currency: memo.egcs_fc_currency, egcs_fc_amount: parseDatabaseMoney(memo.egcs_fc_amount),
        egcs_fc_createdat: isoDate(memo.egcs_fc_createdat), egcs_fc_receiveddate: isoDate(memo.egcs_fc_receiveddate),
        egcs_fc_receiptreference: memo.egcs_fc_receiptreference
      }
    }))
    const offsetRows = await readOffsetMemoRows(db, id, agencies, auth)
    const search = input.search?.trim().toLocaleLowerCase()
    const visible = [...cashRows, ...offsetRows].filter(row => !search
      || row.egcs_fc_creditmemoreference.toLocaleLowerCase().includes(search)
      || row.egcs_fc_agencyname_en.toLocaleLowerCase().includes(search)
      || row.egcs_fc_agencyname_fr.toLocaleLowerCase().includes(search)
      || (row.egcs_fc_kind === 'automatic' && row.egcs_fc_applications.some(application =>
        application.egcs_fc_agreementnumber.toLocaleLowerCase().includes(search)
        || application.egcs_fc_payment.includes(search)))
      || (row.egcs_fc_kind === 'cash' && Boolean(row.egcs_fc_receiptreference?.toLocaleLowerCase().includes(search))))
      .sort((left, right) => right.egcs_fc_createdat.localeCompare(left.egcs_fc_createdat)
        || right.id.localeCompare(left.id, 'en', { numeric: true }))
    return { ...pageResult(visible.slice((input.page - 1) * input.limit, input.page * input.limit), visible.length, input), egcs_fc_cancreate: canCreate }
  })
}

export const listProponentAccountBalances = async (event: H3Event, id: string, requestedInput?: ListInput) => {
  await requireAuthContext(event)
  return await executeFreshReadSnapshot(event, async db => {
    const auth = await authorizeProponent(event, id)
    const input = requestedInput ?? await getValidatedQueryI18n(event, PaginationSchema)
    const agencies = await financialAgencies(db, auth, 'read')
    if (!agencies.length) return pageResult<ProponentAccountBalanceRow>([], 0, input)
    const agencyById = new Map(agencies.map(agency => [String(agency.id), agency]))
    let query = db.selectFrom('Funding_Case_Account_Receivable_Pool')
      .select(['id', 'egcs_fc_agency', 'egcs_fc_currency']).where('egcs_fc_applicantrecipient', '=', id)
      .where('egcs_fc_agency', 'in', [...agencyById.keys()]).where('_deleted', '=', false)
    if (input.search) {
      const search = input.search.toLocaleLowerCase()
      const agencyIds = agencies.filter(agency => agency.egcs_ay_name_en.toLocaleLowerCase().includes(search)
        || agency.egcs_ay_name_fr.toLocaleLowerCase().includes(search)).map(agency => String(agency.id))
      if (!agencyIds.length) return pageResult<ProponentAccountBalanceRow>([], 0, input)
      query = query.where('egcs_fc_agency', 'in', agencyIds)
    }
    const pools = await query.orderBy('egcs_fc_agency').orderBy('egcs_fc_currency').execute()
    const page = pools.slice((input.page - 1) * input.limit, input.page * input.limit)
    const items: ProponentAccountBalanceRow[] = await Promise.all(page.map(async pool => {
      const agency = agencyById.get(String(pool.egcs_fc_agency))
      if (!agency) throw new Error('CREDIT_MEMO_OWNER_CHANGED')
      const ledger = await readAccountReceivablePoolBalance(db, String(pool.id))
      return {
        id: String(pool.id), egcs_fc_agency: String(agency.id), egcs_fc_agencyname_en: agency.egcs_ay_name_en,
        egcs_fc_agencyname_fr: agency.egcs_ay_name_fr, egcs_fc_currency: pool.egcs_fc_currency,
        egcs_fc_debitamount: ledger.egcs_fc_debitamount, egcs_fc_creditamount: ledger.egcs_fc_creditamount,
        egcs_fc_netamount: ledger.egcs_fc_netamount, egcs_fc_receivableamount: ledger.egcs_fc_receivableamount,
        egcs_fc_refundableamount: ledger.egcs_fc_refundableamount
      }
    }))
    return pageResult(items, pools.length, input)
  })
}

const AgencyLookupQuery = PaginationSchema.extend({
  egcs_fc_applicantrecipient: PositivePostgresBigintIdSchema,
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema)
    .min(1, { error: 'validation.required' }).max(100, { error: 'validation.max_items' })])
    .transform(value => [...new Set(Array.isArray(value) ? value : [value])]).optional()
})

export const listProponentCreditMemoAgencyLookup = async (event: H3Event) => {
  await requireAuthContext(event)
  return await executeFreshReadSnapshot(event, async db => {
    const input = await getValidatedQueryI18n(event, AgencyLookupQuery)
    const auth = await requireAuthContext(event)
    const agencies = await financialAgencies(db, auth, 'create')
    await authorize(event, 'account_receivable', 'create', async () => agencies.length
      ? { bypass: true as const }
      : { denied: true as const })
    if (!await hasActiveProponent(db, input.egcs_fc_applicantrecipient)) {
      return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
    }
    const search = input.search?.toLocaleLowerCase()
    const visible = agencies.filter(agency => (!input.selectedIds || input.selectedIds.includes(String(agency.id)))
      && (!search || agency.egcs_ay_name_en.toLocaleLowerCase().includes(search) || agency.egcs_ay_name_fr.toLocaleLowerCase().includes(search)))
    return pageResult(visible.slice((input.page - 1) * input.limit, input.page * input.limit).map(agency => ({
      id: String(agency.id), egcs_ay_name_en: agency.egcs_ay_name_en, egcs_ay_name_fr: agency.egcs_ay_name_fr
    })), visible.length, input)
  })
}
