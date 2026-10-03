/* eslint-disable jsdoc/require-jsdoc -- Starting contexts use the ordinary retained-source extraction and AR authorization boundaries. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AccountReceivableCreate } from '~~/shared/types/schemas/account-receivable'
import type { CapturedAccountReceivableSource } from './account-receivable-source'

export const readAccountReceivableSourceOrigin = async (db: Kysely<Database>, agreementId: string, kind: 'claim' | 'advance', sourceId: string) => kind === 'claim'
  ? await db.selectFrom('Funding_Case_Agreement_Claim as source')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'source.egcs_fc_fiscalyear')
      .select(['source.egcs_fc_applicantrecipient', 'year.egcs_fc_fiscalyear as agencyFiscalYearId'])
      .where('source.id', '=', sourceId).where('source.egcs_fc_fundingagreement', '=', agreementId)
      .where('source._deleted', '=', false).where('year._deleted', '=', false).forShare('source').executeTakeFirst()
  : await db.selectFrom('Funding_Case_Agreement_Payment as source')
      .innerJoin('Funding_Case_Agreement_Budget_Fiscal_Year as year', 'year.id', 'source.egcs_fc_fiscalyear')
      .select(['source.egcs_fc_applicantrecipient', 'year.egcs_fc_fiscalyear as agencyFiscalYearId'])
      .where('source.id', '=', sourceId).where('source.egcs_fc_fundingagreement', '=', agreementId)
      .where('source.egcs_fc_paymenttype', '=', 'advance').where('source._deleted', '=', false)
      .where('year._deleted', '=', false).forShare('source').executeTakeFirst()

export const assertAccountReceivableSourceOrigin = async (db: Kysely<Database>, agreementId: string, input: AccountReceivableCreate,
  definition: { egcs_fc_claimrelated: boolean; egcs_fc_advancepaymentrelated: boolean }, sources: CapturedAccountReceivableSource[]) => {
  const sourceId = input.egcs_fc_sourcepayment ?? input.egcs_fc_sourceclaim
  if (!sourceId) return
  const kind = input.egcs_fc_sourceclaim ? 'claim' : 'advance'
  const origin = await readAccountReceivableSourceOrigin(db, agreementId, kind, sourceId)
  const originSources = sources.filter(row => String(kind === 'claim' ? row.egcs_fc_claim : row.egcs_fc_payment) === sourceId)
  if (!origin || String(origin.egcs_fc_applicantrecipient) !== input.egcs_fc_applicantrecipient
    || String(origin.agencyFiscalYearId) !== input.egcs_fc_agencyfiscalyear
    || definition.egcs_fc_claimrelated !== (kind === 'claim') || definition.egcs_fc_advancepaymentrelated !== (kind === 'advance')
    || !originSources.length || originSources.length !== input.egcs_fc_sources?.length
    || input.egcs_fc_sources.some(id => !originSources.some(row => row.id === id))) throw new Error('AR_SOURCE_UNAVAILABLE')
}
