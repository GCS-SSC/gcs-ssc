/* eslint-disable jsdoc/require-jsdoc -- Agency definitions are captured once and retained by each independent AR case. */
import { sql, type Kysely } from 'kysely'
import type { Database, Currency_Codes } from '~~/shared/types/database'

export const accountReceivableTypeUsage = () => sql<boolean>`exists (
  select 1 from "Funding_Case_Agreement_Account_Receivable"
  where "egcs_fc_type" = "Agency_Account_Receivable_Type"."id"
)`.as('is_in_use')

export const readAccountReceivableType = async (db: Kysely<Database>, agencyId: string, id: string) => {
  const type = await db.selectFrom('Agency_Account_Receivable_Type').selectAll().where('id', '=', id)
    .where('egcs_ay_organizationagency', '=', agencyId).where('_deleted', '=', false).forShare().executeTakeFirst()
  if (!type || type.egcs_ay_claimrelated === type.egcs_ay_advancepaymentrelated) throw new Error('AR_TYPE_UNAVAILABLE')
  return type
}

export const readAccountReceivableAccount = async (db: Kysely<Database>, input: {
  id: string; agencyId: string; streamId: string; agencyFiscalYearId: string; currency: Currency_Codes; kind?: 'account_receivable' | 'credit_memo'
}) => {
  const account = await db.selectFrom('Agency_Chart_of_Account').selectAll().where('id', '=', input.id)
    .where('egcs_ay_organizationagency', '=', input.agencyId).where('egcs_ay_fiscalyear', '=', input.agencyFiscalYearId)
    .where('egcs_ay_currency', '=', input.currency).where('egcs_ay_kind', '=', input.kind ?? 'account_receivable')
    .where('_deleted', '=', false)
    .where(eb => eb.exists(eb.selectFrom('Transfer_Payment_Stream_Chart_of_Account')
      .select('id').whereRef('egcs_tp_agencychartofaccount', '=', 'Agency_Chart_of_Account.id')
      .where('egcs_tp_transferpaymentstream', '=', input.streamId).where('_deleted', '=', false)))
    .forShare().executeTakeFirst()
  if (!account) throw new Error('AR_ACCOUNT_UNAVAILABLE')
  return account
}
