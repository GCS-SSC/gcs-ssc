/* eslint-disable jsdoc/require-jsdoc -- Localized presentation of workflow authoring, without evaluating routing. */
import type { FlowDiagramDefinition } from '@gcs-ssc/diagrams'
import type { AgencyCustomFieldDefinition, AgreementProfileCondition, WorkflowMemberCondition } from '~~/shared/types/schemas/agreement-custom-fields'

export type WorkflowFlowMember = {
  id: string
  egcs_cn_sequence: number
  egcs_cn_kind: 'review_set' | 'recommendation_set' | 'data_collection' | 'approval_template'
  referenceNameEn?: string | null
  referenceNameFr?: string | null
  conditions?: WorkflowMemberCondition[]
  egcs_cn_materializationstatus?: string | null
  egcs_cn_successstatus?: string | null
  egcs_cn_failurestatus?: string | null
  egcs_cn_setsriskrating: boolean
}
export type WorkflowFlowSetup = {
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_purpose: 'standard' | 'approval_submission' | 'risk_rating'
  egcs_cn_allowedstartstatuses: string[]
  egcs_cn_cancellationstatus: string
  egcs_cn_executionfailurestatus: string
  egcs_cn_allowretry: boolean
  members: WorkflowFlowMember[]
}
export type WorkflowFlowChoices = Partial<Record<AgreementProfileCondition['source'], { id: string, name_en: string, name_fr: string }[]>>
type FlowContext = {
  locale: 'en' | 'fr'
  t: (key: string, params?: Record<string, string | number>) => string
  statusName: (id: string | null | undefined) => string
  customFields: AgencyCustomFieldDefinition[]
  choices: WorkflowFlowChoices
}

export const buildWorkflowFlowDefinition = (setup: WorkflowFlowSetup, context: FlowContext): FlowDiagramDefinition => {
  const { locale, t, statusName } = context
  const members = [...setup.members].sort((left, right) => left.egcs_cn_sequence - right.egcs_cn_sequence)
  const conditionCount = members.reduce((count, member) => count + (member.conditions?.length ?? 0), 0)
  const entry = (member: WorkflowFlowMember | undefined) => member
    ? (member.conditions?.length ? `conditions-${member.id}` : member.id)
    : 'success'
  const conditionLine = (condition: WorkflowMemberCondition): string => {
    const field = 'fieldId' in condition ? context.customFields.find(item => item.id === condition.fieldId) : undefined
    const name = 'fieldId' in condition
      ? field?.[`egcs_ay_name_${locale}`] || t('workflow.conditions.unavailable')
      : t(`workflow.conditions.${condition.source}`)
    const options = 'fieldId' in condition
      ? field?.options.map(option => ({
          id: option.id, name_en: option.egcs_ay_name_en, name_fr: option.egcs_ay_name_fr
        }))
      : context.choices[condition.source]
    const value = 'value' in condition
      ? t(condition.value ? 'common.yes' : 'common.no')
      : condition.optionIds.map(id => {
          const option = options?.find(item => item.id === id)
          return option?.[`name_${locale}`] || t('workflow.conditions.unavailable')
        }).join(t('workflow.flow.or'))
    const quantifier = 'quantifier' in condition ? ` (${t(`workflow.conditions.${condition.quantifier}`)})` : ''
    const grouped = 'optionIds' in condition && condition.optionIds.length > 1 ? `(${value})` : value
    return `${name}${quantifier}: ${grouped}`
  }
  const nodes: FlowDiagramDefinition['nodes'] = [{
    id: 'start', kind: 'start', title: t('workflow.flow.start'),
    lines: [t('workflow.flow.allowed', { statuses: setup.egcs_cn_allowedstartstatuses.map(statusName).join(', ') }),
      t('workflow.flow.nonempty'),
      ...(setup.egcs_cn_purpose === 'approval_submission' ? [t('workflow.flow.approval_required')] : []),
      ...(setup.egcs_cn_purpose === 'risk_rating' ? [t('workflow.flow.source_required')] : [])],
    routes: members.length
      ? [{ targetId: entry(members[0]), kind: 'direct', label: t('workflow.flow.begin') }, {
          targetId: 'stopped', kind: 'default', label: t('workflow.flow.cancel'),
          detail: t('workflow.flow.cancel_status', { status: statusName(setup.egcs_cn_cancellationstatus) })
        }]
      : []
  }]
  for (const [index, member] of members.entries()) {
    const next = entry(members[index + 1])
    const name = (locale === 'fr' ? member.referenceNameFr : member.referenceNameEn) || t(`workflow.${member.egcs_cn_kind}`)
    if (member.conditions?.length) nodes.push({
      id: `conditions-${member.id}`, kind: 'decision', title: t('workflow.flow.all_conditions'),
      eyebrow: t('workflow.flow.member_conditions', { sequence: member.egcs_cn_sequence }),
      routes: [{ targetId: member.id, kind: 'conditional', label: t('workflow.flow.match'), detail: member.conditions.map(conditionLine).join(t('workflow.flow.and')) }, {
        targetId: next, kind: 'default', label: t('workflow.flow.skip'), detail: t('workflow.flow.skip_effect')
      }]
    })
    nodes.push({
      id: member.id, kind: 'step',
      title: name,
      eyebrow: `${t('workflow.step')} ${member.egcs_cn_sequence} · ${t(`workflow.${member.egcs_cn_kind}`)}`,
      lines: [
        ...(member.egcs_cn_materializationstatus ? [t('workflow.flow.on_start', { status: statusName(member.egcs_cn_materializationstatus) })] : []),
        ...(member.egcs_cn_successstatus ? [t('workflow.flow.on_success', { status: statusName(member.egcs_cn_successstatus) })] : []),
        ...(member.egcs_cn_setsriskrating ? [t('workflow.flow.risk_source')] : [])
      ],
      routes: [{ targetId: next, kind: 'direct', label: t('workflow.flow.success') }, {
        targetId: 'stopped', kind: 'failure', label: t('workflow.flow.failure'),
        detail: t('workflow.flow.failure_status', { status: statusName(member.egcs_cn_failurestatus || setup.egcs_cn_executionfailurestatus) })
      }]
    })
  }
  if (members.length) nodes.push({
    id: 'success', kind: 'end', title: t('workflow.flow.complete'),
    lines: [t('workflow.flow.positive_outcome'), ...(setup.egcs_cn_purpose === 'risk_rating'
      ? [
          t(setup.egcs_cn_entitytype === 'fundingcaseamendment' ? 'workflow.flow.amendment_risk_effect' : 'workflow.flow.agreement_risk_effect')
        ]
      : [])]
  }, {
    id: 'stopped', kind: 'end', title: t('workflow.flow.stopped'),
    lines: [t('workflow.flow.stops_remaining'),
      t('workflow.flow.execution_status', { status: statusName(setup.egcs_cn_executionfailurestatus) }),
      t(setup.egcs_cn_allowretry ? 'workflow.flow.retry_allowed' : 'workflow.flow.retry_disabled')]
  })
  return {
    title: setup[`egcs_cn_name_${locale}`], description: t('workflow.flow.description'),
    stats: [t(members.length === 1 ? 'workflow.flow.member_count_one' : 'workflow.flow.member_count', { count: members.length }),
      t(conditionCount === 1 ? 'workflow.flow.condition_count_one' : 'workflow.flow.condition_count', { count: conditionCount })],
    orderLabel: t('workflow.flow.order'), nodes
  }
}
