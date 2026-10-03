import { z } from 'zod'
import { authorizeAccountReceivableAgreement } from '~~/server/utils/account-receivable'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import { readAccountReceivableSources, requireAccountReceivableSourceRead } from '~~/server/utils/account-receivable-source'
import { readAccountReceivableSourceOrigin } from '~~/server/utils/account-receivable-source-entry'
import type { AccountReceivableSourceEntry } from '~~/shared/types/account-receivable-source-entry'

const SourceEntryQuery = z.object({ kind: z.enum(['claim', 'advance'], { error: 'validation.invalid_selection' }), sourceId: PositivePostgresBigintIdSchema })

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  const context = await authorizeAccountReceivableAgreement(event, agreementId, 'create')
  await requireAccountReceivableSourceRead(event, event.context.$db, agreementId)
  const input = await getValidatedQueryI18n(event, SourceEntryQuery)
  const db = event.context.$db
  const source = await readAccountReceivableSourceOrigin(db, agreementId, input.kind, input.sourceId)
  if (!source?.egcs_fc_applicantrecipient) return { entry: null }
  const agreement = await db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_currency').where('id', '=', agreementId).executeTakeFirstOrThrow()
  const eligible = await readAccountReceivableSources(db, { agreementId, applicantRecipientId: String(source.egcs_fc_applicantrecipient),
    agencyFiscalYearId: String(source.agencyFiscalYearId), claimRelated: input.kind === 'claim', advancePaymentRelated: input.kind === 'advance', currency: agreement.egcs_fc_currency })
  const sourceIds = eligible.filter(row => String(input.kind === 'claim' ? row.egcs_fc_claim : row.egcs_fc_payment) === input.sourceId).map(row => row.id)
  if (!sourceIds.length) return { entry: null }
  const types = await db.selectFrom('Agency_Account_Receivable_Type').select(['id', 'egcs_ay_name_en as label_en', 'egcs_ay_name_fr as label_fr',
    'egcs_ay_description_en', 'egcs_ay_description_fr', 'egcs_ay_monitorrequired', 'egcs_ay_claimrelated', 'egcs_ay_advancepaymentrelated'])
    .where('egcs_ay_organizationagency', '=', context.agencyId).where('_deleted', '=', false)
    .where('egcs_ay_claimrelated', '=', input.kind === 'claim').where('egcs_ay_advancepaymentrelated', '=', input.kind === 'advance').orderBy('id').execute()
  if (!types.length) return { entry: null }
  const entry: AccountReceivableSourceEntry = { kind: input.kind, id: input.sourceId,
    egcs_fc_applicantrecipient: String(source.egcs_fc_applicantrecipient), egcs_fc_agencyfiscalyear: String(source.agencyFiscalYearId), egcs_fc_sources: sourceIds, types }
  return { entry }
})
