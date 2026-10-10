/* eslint-disable jsdoc/require-jsdoc -- Lookup catalogs expose only independently authorized live sources or scoped retained AR evidence. */
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import { PaginationSchema } from '~~/shared/types/schemas'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { getValidatedQueryI18n } from './api-validate'
import { authorizeAccountReceivableAgreement, authorizeAccountReceivable } from './account-receivable'
import { requireAccountReceivableSourceRead, readAccountReceivableSources, accountReceivableError } from './account-receivable-source'
import { formatAccountingDimensions } from '~~/shared/utils/accounting-dimensions'
import { TransferPaymentStreamChartOfAccountDimensionSchema } from '~~/shared/types/schemas/transfer-payment'

import { readAccountReceivableType } from './account-receivable-configuration'
import { escapeLikePattern } from './sql-like'

const SelectedLookupQuery = PaginationSchema.extend({
  selectedIds: z.union([PositivePostgresBigintIdSchema, z.array(PositivePostgresBigintIdSchema)
    .min(1, { error: 'validation.required' }).max(100, { error: 'validation.max_items' })])
    .transform(value => [...new Set(Array.isArray(value) ? value : [value])]).optional()
})

const SourceQuery = PaginationSchema.extend({ egcs_fc_applicantrecipient: PositivePostgresBigintIdSchema,
  egcs_fc_agencyfiscalyear: PositivePostgresBigintIdSchema, egcs_fc_type: PositivePostgresBigintIdSchema })

export const listAccountReceivableSourceLookup = async (event: H3Event, agreementId: string) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, SourceQuery)
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  let type
  try {
    type = await readAccountReceivableType(event.context.$db, context.agencyId, input.egcs_fc_type)
  } catch (error) {
    return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_TYPE_UNAVAILABLE')
  }
  const sources = await readAccountReceivableSources(event.context.$db, { agreementId, applicantRecipientId: input.egcs_fc_applicantrecipient,
    agencyFiscalYearId: input.egcs_fc_agencyfiscalyear, claimRelated: type.egcs_ay_claimrelated, advancePaymentRelated: type.egcs_ay_advancepaymentrelated, currency: agreement.egcs_fc_currency })
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
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  return { items: rows.map(row => ({ ...row, egcs_fc_currency: agreement.egcs_fc_currency })), total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableMonitorLookup = async (event: H3Event, agreementId: string) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, PaginationSchema.extend({ egcs_fc_type: PositivePostgresBigintIdSchema }))
  try {
    const type = await readAccountReceivableType(event.context.$db, context.agencyId, input.egcs_fc_type)
    if (!type.egcs_ay_monitorrequired) return { items: [], total: 0, page: input.page, limit: input.limit }
  } catch (error) { return await accountReceivableError(event, error instanceof Error ? error.message : 'AR_TYPE_UNAVAILABLE') }
  let query = event.context.$db.selectFrom('Funding_Case_Agreement_Monitor_Followup as followup')
    .innerJoin('Funding_Case_Agreement_Monitor as monitor', 'monitor.id', 'followup.egcs_fc_fundingagreementmonitor')
    .innerJoin('Transfer_Payment_Monitor_Type as monitor_type', 'monitor_type.id', 'monitor.egcs_fc_type')
    .innerJoin('Agency_Monitor_Type as agency_type', 'agency_type.id', 'monitor_type.egcs_tp_agencymonitortype')
    .where('agency_type.egcs_ay_receivableeligible', '=', true).where('agency_type._deleted', '=', false).where('monitor_type._deleted', '=', false)
    .where('monitor.egcs_fc_fundingagreement', '=', agreementId).where('monitor._deleted', '=', false).where('followup._deleted', '=', false)
  if (input.search) query = query.where('followup.egcs_fc_followupname', 'ilike', `%${input.search}%`)
  const rows = await query.select(['followup.id', 'followup.egcs_fc_followupname as label_en', 'followup.egcs_fc_followupname as label_fr']).orderBy('followup.id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  return { items: rows, total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableTypeLookup = async (event: H3Event, agreementId: string) => {
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  const input = await getValidatedQueryI18n(event, SelectedLookupQuery.extend({ source_family: z.enum(['claim', 'advance'], { error: 'validation.invalid_selection' }).optional() }))
  let query = event.context.$db.selectFrom('Agency_Account_Receivable_Type')
    .where('egcs_ay_organizationagency', '=', context.agencyId).where('_deleted', '=', false)
  if (input.source_family) query = query.where('egcs_ay_claimrelated', '=', input.source_family === 'claim')
    .where('egcs_ay_advancepaymentrelated', '=', input.source_family === 'advance')
  if (input.selectedIds) query = query.where('id', 'in', input.selectedIds)
  if (input.search) query = query.where(eb => eb.or([eb('egcs_ay_name_en', 'ilike', `%${escapeLikePattern(input.search!)}%`), eb('egcs_ay_name_fr', 'ilike', `%${escapeLikePattern(input.search!)}%`)]))
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const items = await query.select(['id', 'egcs_ay_name_en as label_en', 'egcs_ay_name_fr as label_fr', 'egcs_ay_description_en',
    'egcs_ay_description_fr', 'egcs_ay_monitorrequired', 'egcs_ay_advancepaymentrelated', 'egcs_ay_claimrelated'])
    .orderBy('id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  return { items, total: Number(count.total), page: input.page, limit: input.limit }
}

export const listAccountReceivableChartLookup = async (event: H3Event, id: string) => {
  const context = await authorizeAccountReceivable(event, id)
  const input = await getValidatedQueryI18n(event, SelectedLookupQuery.extend({ egcs_fc_agencyfiscalyear: PositivePostgresBigintIdSchema.optional() }))
  const header = await event.context.$db.selectFrom('Funding_Case_Agreement_Account_Receivable').select(['egcs_fc_currency', 'egcs_fc_agencyfiscalyear']).where('id', '=', id).executeTakeFirstOrThrow()
  if (input.egcs_fc_agencyfiscalyear && input.egcs_fc_agencyfiscalyear !== String(header.egcs_fc_agencyfiscalyear)) return await accountReceivableError(event, 'AR_ACCOUNT_UNAVAILABLE')
  let query = event.context.$db.selectFrom('Agency_Chart_of_Account').where('egcs_ay_organizationagency', '=', context.agencyId)
    .where('egcs_ay_fiscalyear', '=', String(header.egcs_fc_agencyfiscalyear)).where('egcs_ay_currency', '=', header.egcs_fc_currency)
    .where('egcs_ay_kind', '=', 'account_receivable').where('_deleted', '=', false)
    .where(eb => eb.exists(eb.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .select('id').whereRef('egcs_tp_agencychartofaccount', '=', 'Agency_Chart_of_Account.id')
      .where('egcs_tp_transferpaymentstream', '=', context.streamId).where('_deleted', '=', false)))
  if (input.selectedIds) query = query.where('id', 'in', input.selectedIds)
  if (input.search) query = query.where(sql<boolean>`egcs_ay_accountingdimensions::text ILIKE ${`%${escapeLikePattern(input.search)}%`}`)
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const accounts = await query.select(['id', 'egcs_ay_accountingdimensions']).orderBy('id').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const items = accounts.map(account => {
    const dimensions = z.array(TransferPaymentStreamChartOfAccountDimensionSchema).parse(account.egcs_ay_accountingdimensions)
    return { ...account, label_en: formatAccountingDimensions(dimensions, 'en'), label_fr: formatAccountingDimensions(dimensions, 'fr') }
  })
  return { items, total: Number(count.total), page: input.page, limit: input.limit }
}
