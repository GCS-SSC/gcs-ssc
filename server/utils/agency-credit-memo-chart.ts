/* eslint-disable jsdoc/require-jsdoc -- Agency chart links use the existing fresh Agency catalog transaction. */
import type { H3Event } from 'h3'
import type { Kysely } from 'kysely'
import type { Database, Currency_Codes } from '~~/shared/types/database'
import { badRequest } from './api-errors'

export const assertAgencyCreditMemoCommitmentChart = async (
  event: H3Event, db: Kysely<Database>,
  input: { agencyId: string; fiscalYearId: string; currency: Currency_Codes; kind: string; commitmentChartId?: string | null }
): Promise<void> => {
  if (!input.commitmentChartId) return
  if (input.kind !== 'credit_memo') return await badRequest(event, 'INVALID_CREDIT_MEMO_COMMITMENT_CHART', 'apiErrors.agency.invalid_credit_memo_commitment_chart')
  const linked = await db.selectFrom('Agency_Chart_of_Account').select('id')
    .where('id', '=', input.commitmentChartId).where('egcs_ay_organizationagency', '=', input.agencyId)
    .where('egcs_ay_fiscalyear', '=', input.fiscalYearId).where('egcs_ay_currency', '=', input.currency)
    .where('egcs_ay_kind', '=', 'commitment').where('_deleted', '=', false).forShare().executeTakeFirst()
  if (!linked) return await badRequest(event, 'INVALID_CREDIT_MEMO_COMMITMENT_CHART', 'apiErrors.agency.invalid_credit_memo_commitment_chart')
}
