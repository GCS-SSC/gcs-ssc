import { sql } from 'kysely'
import { authorizeCorrectionAgreement } from '~~/server/utils/correction'
import { requireAuthContext } from '~~/server/utils/authorize'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { withBusinessRecordState } from '~~/server/utils/business-record-state'
import { correctionCollectionQuery, CorrectionCollectionQuerySchema } from '~~/server/utils/correction-reporting'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  const context = await authorizeCorrectionAgreement(event, agreementId, 'read')
  const input = await getValidatedQueryI18n(event, CorrectionCollectionQuerySchema)
  const query = correctionCollectionQuery(event.context.$db, agreementId, input)
  const rows = await query.selectAll('correction').orderBy('correction.id', 'desc').limit(input.limit).offset((input.page - 1) * input.limit).execute()
  const count = await query.select(sql<string>`count(*)::text`.as('total')).executeTakeFirstOrThrow()
  const auth = await requireAuthContext(event)
  const agreement = await event.context.$db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_agreementnumber')
    .where('id', '=', agreementId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  const fiscalYears = await event.context.$db.selectFrom('Funding_Case_Agreement_Correction_Line as line')
    .innerJoin('Funding_Case_Agreement_Correction as correction', 'correction.id', 'line.egcs_fc_correction')
    .select(['line.egcs_fc_agencyfiscalyear as id', 'line.egcs_fc_fiscalyeardisplay as label_en',
      'line.egcs_fc_fiscalyeardisplay as label_fr']).distinct()
    .where('correction.egcs_fc_fundingagreement', '=', agreementId).where('correction._deleted', '=', false)
    .where('line._deleted', '=', false).orderBy('line.egcs_fc_agencyfiscalyear').execute()
  return { items: await withBusinessRecordState(event.context.$db, 'fundingcasecorrection', rows), total: Number(count.total),
    page: input.page, limit: input.limit, egcs_fc_fiscalyears: fiscalYears,
    egcs_fc_agreementnumber: agreement.egcs_fc_agreementnumber,
    egcs_fc_agreementreadable: auth.userAbilities.authorize('agreement', 'read', context.scope),
    egcs_fc_cancreate: auth.userAbilities.authorize('correction', 'create', context.scope) }
})
