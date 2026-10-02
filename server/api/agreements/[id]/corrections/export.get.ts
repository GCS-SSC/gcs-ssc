import { setHeader } from 'h3'
import { useTranslation } from '@intlify/h3'
import { authorizeCorrectionAgreement, readCorrectionLines } from '~~/server/utils/correction'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { correctionCollectionQuery, CorrectionCollectionQuerySchema, correctionCsvCell } from '~~/server/utils/correction-reporting'
import { resolveRequestLocale } from '~~/server/utils/request-locale'
import { formatCorrectionReference } from '~~/shared/utils/correction'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'read')
  const input = await getValidatedQueryI18n(event, CorrectionCollectionQuerySchema)
  const rows = await correctionCollectionQuery(event.context.$db, agreementId, input).selectAll('correction').orderBy('correction.id').execute()
  const french = resolveRequestLocale(event) === 'fr'
  const t = await useTranslation(event)
  const csv: unknown[][] = [['reference', 'outcome', 'fiscal_year', 'line', 'currency', 'adjustment', 'rationale', 'creator', 'decision_actor', 'decision_date', 'posting_runtime']
    .map(key => t(`correction.export.${key}`))]
  for (const row of rows) {
    for (const line of await readCorrectionLines(event.context.$db, String(row.id))) {
      if (input.egcs_fc_agencyfiscalyear && String(line.egcs_fc_agencyfiscalyear) !== input.egcs_fc_agencyfiscalyear) continue
      csv.push([formatCorrectionReference(row), row.egcs_fc_outcome,
        line.egcs_fc_fiscalyeardisplay, line.egcs_fc_commitmentlinenumber, row.egcs_fc_currency,
        line.egcs_fc_adjustment, french ? row.egcs_fc_narrative_fr || row.egcs_fc_narrative_en : row.egcs_fc_narrative_en || row.egcs_fc_narrative_fr,
        row.egcs_fc_createdby, row.egcs_fc_terminalby, row.egcs_fc_terminalat, row.egcs_fc_postingruntime])
    }
  }
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', 'attachment; filename="corrections.csv"')
  return '\uFEFF' + csv.map(row => row.map(correctionCsvCell).join(',')).join('\r\n')
})
