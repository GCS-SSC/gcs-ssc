/* eslint-disable jsdoc/require-jsdoc -- Shared presentation of workflow result conditions. */
import type { WorkflowResultCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import type { ChecklistResult } from '~~/shared/types/schemas/checklist/checklist'

export type WorkflowResultSource = {
  source: WorkflowResultCondition['source']
  nestedMemberId: string
  nameEn: string
  nameFr: string
}

export type WorkflowResultMember = {
  id: string
  egcs_cn_sequence: number
  referenceNameEn?: string | null
  referenceNameFr?: string | null
  resultSources?: WorkflowResultSource[]
}

type Translate = (key: string, params?: Record<string, string | number>) => string

export const workflowScoreOperators = {
  eq: '=',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥'
} satisfies Record<Extract<WorkflowResultCondition, { source: 'assessment_score' }>['operator'], string>

export const workflowResultValueLabel = (value: number | boolean | ChecklistResult | null, locale: string, t: Translate): string => {
  if (value === null) return t('workflow.conditions.source_skipped')
  if (typeof value === 'boolean') return t(value ? 'recommendation.outcomes.recommended' : 'recommendation.outcomes.not_recommended')
  if (typeof value === 'number') return new Intl.NumberFormat(locale, { maximumSignificantDigits: 17 }).format(value)
  return t(`checklist.result.${value}`)
}

export const workflowResultPredicateLabel = (condition: WorkflowResultCondition, locale: string, t: Translate): string => {
  if (condition.source === 'checklist_result') {
    return condition.values.map(value => workflowResultValueLabel(value, locale, t)).join(t('workflow.flow.or'))
  }
  const value = workflowResultValueLabel(condition.value, locale, t)
  return condition.source === 'assessment_score' ? `${workflowScoreOperators[condition.operator]} ${value}` : value
}

export const workflowResultSourceLabel = (
  condition: WorkflowResultCondition,
  consumerSequence: number,
  members: WorkflowResultMember[],
  locale: string,
  t: Translate
) => {
  const result = t(`workflow.conditions.${condition.source}`)
  const member = members.find(item => item.id === condition.workflowMemberId)
  if (!member) return { label: result, error: t('workflow.conditions.result_source_unavailable') }
  const step = t('workflow.conditions.step', { number: member.egcs_cn_sequence })
  const source = member.resultSources?.find(item => item.nestedMemberId === condition.nestedMemberId && item.source === condition.source)
  if (!source) {
    const name = (locale === 'fr' ? member.referenceNameFr : member.referenceNameEn) ?? t('workflow.conditions.unavailable')
    return {
      label: t('workflow.conditions.result_source_label', { step, name, result }),
      error: t('workflow.conditions.result_source_unavailable')
    }
  }
  const name = locale === 'fr' ? source.nameFr : source.nameEn
  return {
    label: t('workflow.conditions.result_source_label', { step, name, result }),
    error: member.egcs_cn_sequence >= consumerSequence ? t('workflow.conditions.result_source_order') : null
  }
}
