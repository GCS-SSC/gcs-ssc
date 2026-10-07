import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import type { AgreementRiskSource } from '~~/shared/types/risk'

/**
 * Presents the source that produced the Agreement's current risk score.
 * @param source - Reactive immutable promotion or workflow evidence.
 * @returns Localized source labels and captured completion date.
 */
export const useAgreementRiskSource = (source: MaybeRefOrGetter<AgreementRiskSource | undefined>) => {
  const { t } = useI18n()
  const { getBilingualValue } = useBilingualValue()
  const label = computed(() => {
    const evidence = toValue(source)
    if (evidence?.kind === 'amendment') {
      return t('agreement.risk_source_amendment', { number: evidence.amendmentNumber ?? evidence.amendmentId })
    }
    return evidence?.kind === 'workflow' ? t('agreement.risk_source_workflow') : t('agreement.risk_rating_manual')
  })
  const workflowLabel = computed(() => {
    const evidence = toValue(source)
    if (!evidence || evidence.kind === 'manual' || !evidence.workflowName) return null
    return getBilingualValue({ name_en: evidence.workflowName.en, name_fr: evidence.workflowName.fr }, 'name')
  })
  const completedAt = computed(() => {
    const evidence = toValue(source)
    if (!evidence || evidence.kind === 'manual') return null
    return evidence.kind === 'amendment' ? evidence.approvedAt : evidence.calculationSource?.completedAt ?? null
  })
  return { label, workflowLabel, completedAt }
}
