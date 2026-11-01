import type { CorrectionExport } from '~~/shared/types/schemas/correction-export'
import { majorMoneyText } from '~~/shared/utils/money'
import { defineEventHandler, getRouterParam } from 'h3'
import { useTranslation } from '@intlify/h3'
import { authorizeCorrectionAgreement, readCorrectionLines } from '~~/server/utils/correction'
import { getValidatedQueryI18n } from '~~/server/utils/api-validate'
import { correctionCollectionQuery, CorrectionCollectionQuerySchema } from '~~/server/utils/correction-reporting'
import { resolveRequestLocale } from '~~/server/utils/request-locale'
import { formatCorrectionReference } from '~~/shared/utils/correction'

export default defineEventHandler(async event => {
  const agreementId = getRouterParam(event, 'id') ?? ''
  await authorizeCorrectionAgreement(event, agreementId, 'read')
  const input = await getValidatedQueryI18n(event, CorrectionCollectionQuerySchema)
  const rows = await correctionCollectionQuery(event.context.$db, agreementId, input).selectAll('correction').orderBy('correction.id').execute()
  const french = resolveRequestLocale(event) === 'fr'
  const t = await useTranslation(event)
  const fields = ['reference', 'outcome', 'fiscal_year', 'line', 'currency', 'adjustment', 'rationale', 'creator', 'decision_actor', 'decision_date', 'posting_runtime'].map(key => t(`correction.export.${key}`))
  const data: CorrectionExport['data'] = []
  for (const row of rows) {
    for (const line of await readCorrectionLines(event.context.$db, String(row.id))) {
      if (input.egcs_fc_agencyfiscalyear && String(line.egcs_fc_agencyfiscalyear) !== input.egcs_fc_agencyfiscalyear) continue
      data.push([formatCorrectionReference(row), t(`correction.outcomes.${row.egcs_fc_outcome}`),
        line.egcs_fc_fiscalyeardisplay, String(line.egcs_fc_commitmentlinenumber), row.egcs_fc_currency,
        majorMoneyText(line.egcs_fc_adjustment), french ? row.egcs_fc_narrative_fr || row.egcs_fc_narrative_en : row.egcs_fc_narrative_en || row.egcs_fc_narrative_fr,
        row.egcs_fc_createdby, row.egcs_fc_terminalby, row.egcs_fc_terminalat instanceof Date ? row.egcs_fc_terminalat.toISOString() : row.egcs_fc_terminalat, row.egcs_fc_postingruntime])
    }
  }
  return { fields, data } satisfies CorrectionExport
})
