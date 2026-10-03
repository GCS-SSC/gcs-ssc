/* eslint-disable jsdoc/require-jsdoc -- Lookup catalogs expose only independently authorized live sources or scoped retained AR evidence. */
import { getQuery, type H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { CURRENCY_CODES_ENUM } from '~~/shared/constants/enums'
import { getValidatedQueryI18n } from './api-validate'
import { authorizeAccountReceivableAgreement, authorizeAccountReceivable } from './account-receivable'
import { requireAccountReceivableSourceRead, readAccountReceivableSources } from './account-receivable-source'
import { readAccountReceivablePoolDebts } from './account-receivable-recovery'
import { requireAuthContext } from './authorize'
import { resolveAgreementScopeContext } from './agreement'
import { moneyToCents, type Money } from '~~/shared/utils/money'

const SourceQuery = PaginationSchema.extend({ egcs_fc_applicantrecipient: PositivePostgresBigintIdSchema,
  egcs_fc_agencyfiscalyear: PositivePostgresBigintIdSchema, egcs_fc_type: z.enum(['ineligible_expense', 'outstanding_advance']) })

export const listAccountReceivableSourceLookup = async (event: H3Event, agreementId: string) => {
  await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, SourceQuery)
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  const sources = await readAccountReceivableSources(event.context.$db, { agreementId, applicantRecipientId: input.egcs_fc_applicantrecipient,
    agencyFiscalYearId: input.egcs_fc_agencyfiscalyear, type: input.egcs_fc_type, currency: agreement.egcs_fc_currency })
  const rows = input.search ? sources.filter(row => row.label_en.toLowerCase().includes(input.search!.toLowerCase()) || row.label_fr.toLowerCase().includes(input.search!.toLowerCase())) : sources
  return { items: rows.slice((input.page - 1) * input.limit, input.page * input.limit).map(({ coding: _coding, ...row }) => row), total: rows.length, page: input.page, limit: input.limit }
}

export const listAccountReceivableProponentLookup = async (event: H3Event, agreementId: string) => {
  await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, PaginationSchema)
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Applicant_Recipient as relationship')
    .innerJoin('Applicant_Recipient_Profile as debtor', 'debtor.id', 'relationship.egcs_fc_applicantrecipient')
    .where('relationship.egcs_fc_fundingagreement', '=', agreementId).where('relationship._deleted', '=', false).where('debtor._deleted', '=', false)
  if (input.search) query = query.where(eb => eb.or([eb('debtor.egcs_ar_legalname_en', 'ilike', `%${input.search}%`), eb('debtor.egcs_ar_legalname_fr', 'ilike', `%${input.search}%`)]))
  const rows = await query.select(['debtor.id', sql<string>`COALESCE(debtor.egcs_ar_legalname_en,debtor.egcs_ar_operatingname_en,'')`.as('label_en'), sql<string>`COALESCE(debtor.egcs_ar_legalname_fr,debtor.egcs_ar_operatingname_fr,'')`.as('label_fr')]).orderBy('debtor.id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows, total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableYearLookup = async (event: H3Event, agreementId: string) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, PaginationSchema)
  let query = event.context.$db.selectFrom('Agency_Fiscal_Year').where('egcs_ay_organizationagency', '=', context.agencyId).where('_deleted', '=', false)
  if (input.search) query = query.where('egcs_ay_fiscalyeardisplay', 'ilike', `%${input.search}%`)
  const rows = await query.select(['id', 'egcs_ay_fiscalyeardisplay as label_en', 'egcs_ay_fiscalyeardisplay as label_fr']).orderBy('egcs_ay_fiscalyear', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows, total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableMonitorLookup = async (event: H3Event, agreementId: string) => {
  await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, PaginationSchema)
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup as followup')
    .innerJoin('Funding_Case_Agreement_Monitor as monitor', 'monitor.id', 'followup.egcs_fc_fundingagreementmonitor')
    .where('monitor.egcs_fc_fundingagreement', '=', agreementId).where('monitor._deleted', '=', false).where('followup._deleted', '=', false)
  if (input.search) query = query.where('followup.egcs_fc_followupname', 'ilike', `%${input.search}%`)
  const rows = await query.select(['followup.id', 'followup.egcs_fc_followupname as label_en', 'followup.egcs_fc_followupname as label_fr']).orderBy('followup.id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows, total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableCreditMemoLineLookup = async (event: H3Event) => {
  const raw = getQuery(event)
  const anchor = await authorizeAccountReceivable(event, String(raw.egcs_fc_receivable ?? ''))
  const input = await getValidatedQueryI18n(event, PaginationSchema.extend({ egcs_fc_receivable: PositivePostgresBigintIdSchema,
    egcs_fc_applicantrecipient: PositivePostgresBigintIdSchema, egcs_fc_currency: z.enum(CURRENCY_CODES_ENUM) }))
  const auth = await requireAuthContext(event)
  const debts = await readAccountReceivablePoolDebts(event.context.$db, { agencyId: anchor.agencyId,
    applicantRecipientId: input.egcs_fc_applicantrecipient, currency: input.egcs_fc_currency })
  const rows: Array<{ id: string; label_en: string; label_fr: string; egcs_fc_available: Money; egcs_fc_fundingagreement: string }> = []
  for (const debt of debts) {
    const context = await resolveAgreementScopeContext(String(debt.egcs_fc_fundingagreement), event.context.$db)
    if (!context || !auth.userAbilities.authorize('account_receivable', 'read', context.scope) || !auth.userAbilities.authorize('account_receivable', 'create', context.scope)) continue
    for (const line of debt.lines.filter(line => moneyToCents(line.egcs_fc_available) > BigInt(0))) rows.push({ id: String(line.id),
      label_en: `${debt.egcs_fc_agreementnumber} · AR ${debt.egcs_fc_number} · ${line.egcs_fc_available} ${debt.egcs_fc_currency.toUpperCase()}`,
      label_fr: `${debt.egcs_fc_agreementnumber} · CR ${debt.egcs_fc_number} · ${line.egcs_fc_available} ${debt.egcs_fc_currency.toUpperCase()}`,
      egcs_fc_available: line.egcs_fc_available, egcs_fc_fundingagreement: String(debt.egcs_fc_fundingagreement) })
  }
  const selected = input.search ? rows.filter(row => row.label_en.toLowerCase().includes(input.search!.toLowerCase()) || row.label_fr.toLowerCase().includes(input.search!.toLowerCase())) : rows
  return { items: selected.slice((input.page - 1) * input.limit, input.page * input.limit).map(row => ({ ...row, egcs_fc_priority: rows.indexOf(row) })), total: selected.length, page: input.page, limit: input.limit }
}
