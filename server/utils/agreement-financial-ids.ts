/* eslint-disable jsdoc/require-jsdoc -- Internal Agreement relationship policy. */
import type { Kysely } from 'kysely'
import type { H3Event } from 'h3'
import { sql } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import { parseI18n } from './api-validate'
import { escapeLikePattern } from './sql-like'

const agreementFinancialIdsQuery = (db: Kysely<Database>, streamId: string, proponentId: string) => db
  .selectFrom('Applicant_Recipient_Agency_Financial_Id as f')
  .innerJoin('Transfer_Payment_Profile as p', 'p.egcs_tp_agency', 'f.egcs_ar_agency')
  .innerJoin('Transfer_Payment_Stream as s', 's.egcs_tp_transferpaymentprofile', 'p.id')
  .where('s.id', '=', streamId)
  .where('f.egcs_ar_applicantrecipient', '=', proponentId)

export const listAgreementFinancialIds = async (
  db: Kysely<Database>, streamId: string, proponentId: string,
  options: { page: number; limit: number; search?: string; savedId?: string; selectedId?: string }
) => {
  let query = agreementFinancialIdsQuery(db, streamId, proponentId)
    .where(eb => eb.or([
      eb.and([eb('f.egcs_ar_active', '=', true), eb('f._deleted', '=', false)]),
      ...(options.savedId ? [eb('f.id', '=', options.savedId)] : [])
    ]))
  if (options.search) query = query.where(eb => eb.or([
    eb(sql<string>`f.egcs_ar_financialsystemid::text`, 'ilike', `%${escapeLikePattern(options.search!)}%`),
    eb(sql<string>`f.id::text`, '=', options.search!),
    ...(options.selectedId ? [eb('f.id', '=', options.selectedId)] : []),
    ...(options.savedId ? [eb('f.id', '=', options.savedId)] : [])
  ]))
  const [items, count] = await Promise.all([
    query.select(['f.id', 'f.egcs_ar_financialsystemid', 'f.egcs_ar_active', 'f._deleted',
      'f.egcs_ar_financialsystemid as financial_system_id'])
      .orderBy(sql<number>`CASE WHEN f.id::text = ${options.selectedId ?? options.savedId ?? options.search ?? ''} THEN 0 ELSE 1 END`)
      .orderBy('f.id').limit(options.limit).offset((options.page - 1) * options.limit).execute(),
    query.select(eb => eb.fn.count('f.id').as('total')).executeTakeFirstOrThrow()
  ])
  return { items, total: Number(count.total), page: options.page, limit: options.limit }
}

export const assertAgreementFinancialId = async (
  event: H3Event, db: Kysely<Database>, streamId: string, proponentId: string,
  financialId: string, path: (string | number)[] = ['egcs_fc_agencyfinancialid'],
  options: { preserveSavedId?: boolean } = {}
) => {
  let query = agreementFinancialIdsQuery(db, streamId, proponentId).where('f.id', '=', financialId)
  if (!options.preserveSavedId) query = query.where('f.egcs_ar_active', '=', true).where('f._deleted', '=', false)
  const selected = await query.select(['f.id', 'f.egcs_ar_financialsystemid'])
    .forShare('f').executeTakeFirst()
  await parseI18n(event, z.object({}).superRefine((_value, ctx) => {
    if (!selected) ctx.addIssue({ code: 'custom', message: 'validation.invalid_agreement_financial_id', path })
  }), {})
  return selected!
}
