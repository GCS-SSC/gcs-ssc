/* eslint-disable jsdoc/require-jsdoc -- exported schema helpers are self-descriptive */
import type {
  AssessmentDefinitionEditorState,
  AssessmentImpactorRow,
  AssessmentItemRow,
  AssessmentSectionRow,
  AssessmentSubSectionRow
} from '~/composables/useAssessmentSchemaEditorState'

type LabelValue = {
  en?: string
  fr?: string
}

type AssessmentLocale = 'en' | 'fr'

type DependencyOn = {
  type?: string
  field?: string
  section?: string
  subsection?: string
  question?: string
}

export type AssessmentAnswerPathItem = {
  label: string
  sectionLabel?: string
  subSectionLabel?: string
  questionLabel?: string
  value: string
}

export type AssessmentAnswerPathTreeNode = {
  id: string
  label: string
  value?: string
  icon?: string
  defaultExpanded?: boolean
  children?: AssessmentAnswerPathTreeNode[]
}

const toReadableToken = (value: string) => value
  .replaceAll('.', ' > ')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, char => char.toUpperCase())

export const getAssessmentDisplayLabel = (label: LabelValue | undefined, fallback = '') => {
  const english = String(label?.en ?? '').trim()
  const french = String(label?.fr ?? '').trim()

  if (english && french) {
    return `${english} / ${french}`
  }

  if (english) {
    return english
  }

  if (french) {
    return french
  }

  return fallback
}

export const getAssessmentLocaleLabel = (
  label: LabelValue | undefined,
  locale: AssessmentLocale,
  fallback = ''
) => {
  const primary = String(label?.[locale] ?? '').trim()
  const secondaryLocale: AssessmentLocale = locale === 'fr' ? 'en' : 'fr'
  const secondary = String(label?.[secondaryLocale] ?? '').trim()

  if (primary) {
    return primary
  }

  if (secondary) {
    return secondary
  }

  return fallback
}

type AssessmentDependencyFormatOptions = {
  helpersLabel?: string
  answersLabel?: string
  resolveHelperLabel?: (field: string) => string
  resolveAnswerLabel?: (section: string, subsection: string, question: string) => string[]
}

export const formatAssessmentDependencyTarget = (value: unknown, options: AssessmentDependencyFormatOptions = {}) => {
  if (typeof value === 'string') {
    return toReadableToken(value)
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }

  const target = value as DependencyOn

  if (target.type === 'helpers') {
    const field = String(target.field ?? '')
    return [options.helpersLabel ?? 'Helpers', options.resolveHelperLabel?.(field) ?? toReadableToken(field)].filter(Boolean).join(' > ')
  }

  if (target.type === 'answers') {
    const section = String(target.section ?? '')
    const subsection = String(target.subsection ?? '')
    const question = String(target.question ?? '')
    return [options.answersLabel ?? 'Answers', ...(options.resolveAnswerLabel?.(section, subsection, question) ?? [
      toReadableToken(section), toReadableToken(subsection), toReadableToken(question)
    ])].filter(Boolean).join(' > ')
  }

  return ''
}

const addDependencyLabel = (labels: Set<string>, value: unknown, options: AssessmentDependencyFormatOptions) => {
  if (Array.isArray(value)) {
    value.forEach(item => addDependencyLabel(labels, item, options))
    return
  }

  const formatted = formatAssessmentDependencyTarget(value, options)
  if (formatted) {
    labels.add(formatted)
  }
}

const collectDependsLabels = (labels: Set<string>, value: unknown, options: AssessmentDependencyFormatOptions) => {
  if (!Array.isArray(value)) {
    return
  }

  value.forEach(item => {
    if (Array.isArray(item)) {
      item.forEach(entry => addDependencyLabel(labels, (entry as { on?: unknown }).on, options))
      return
    }

    addDependencyLabel(labels, (item as { on?: unknown }).on, options)
  })
}

const collectWeightDependencyLabels = (labels: Set<string>, value: unknown, options: AssessmentDependencyFormatOptions) => {
  if (Array.isArray(value)) {
    value.forEach(item => {
      if (Array.isArray(item)) {
        item.forEach(entry => addDependencyLabel(labels, (entry as { on?: unknown }).on, options))
        return
      }

      addDependencyLabel(labels, (item as { on?: unknown }).on, options)
    })
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  addDependencyLabel(labels, (value as { on?: unknown }).on, options)
}

export const collectAssessmentDependencyLabels = (state: AssessmentDefinitionEditorState, options: AssessmentDependencyFormatOptions = {}) => {
  const labels = new Set<string>()

  state.sections.forEach(section => {
    section.subSections.forEach(subSection => {
      collectWeightDependencyLabels(labels, subSection.weight, options)
      collectDependsLabels(labels, subSection.depends, options)

      subSection.questions.forEach(item => {
        collectWeightDependencyLabels(labels, item.weight, options)
        collectDependsLabels(labels, item.depends, options)
      })
    })
  })

  state.impactors.forEach(impactor => {
    addDependencyLabel(labels, impactor.on, options)
  })

  return Array.from(labels)
}

export const countAssessmentDependencies = (value: unknown): number => {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countAssessmentDependencies(item), 0)
  }

  if (value && typeof value === 'object') {
    return 1
  }

  return 0
}

export const getAssessmentWeightMode = (value: unknown): 'fixed' | 'adjustable' | 'array' => {
  if (Array.isArray(value)) {
    return 'array'
  }

  if (value && typeof value === 'object' && (value as { adjustable?: boolean }).adjustable === true) {
    return 'adjustable'
  }

  return 'fixed'
}

export const getAssessmentFixedWeight = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return value
  }

  if (Array.isArray(value)) {
    return typeof value[0] === 'number' ? value[0] : null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>

  if (record.adjustable === false && typeof record.weight === 'number') {
    return record.weight
  }

  return null
}

export const buildAssessmentAnswerPathTree = (
  items: AssessmentAnswerPathItem[]
): AssessmentAnswerPathTreeNode[] => {
  const sections = new Map<string, AssessmentAnswerPathTreeNode>()

  items.forEach(item => {
    let path: unknown
    try {
      path = JSON.parse(item.value)
    } catch {
      path = item.value.split('|')
    }
    const [sectionCode = '', subSectionCode = '', questionCode = ''] = Array.isArray(path)
      ? path.map(value => String(value))
      : []
    const [legacySectionLabel = '', legacySubSectionLabel = '', legacyQuestionLabel = item.label] = item.label.split(' > ')
    const sectionLabel = item.sectionLabel ?? legacySectionLabel
    const subSectionLabel = item.subSectionLabel ?? legacySubSectionLabel
    const questionLabel = item.questionLabel ?? legacyQuestionLabel

    if (!sectionCode || !subSectionCode || !questionCode) {
      return
    }

    let sectionNode = sections.get(sectionCode)
    if (!sectionNode) {
      sectionNode = {
        id: `section:${sectionCode}`,
        label: sectionLabel,
        icon: 'i-lucide-folder-open',
        defaultExpanded: true,
        children: []
      }
      sections.set(sectionCode, sectionNode)
    }

    const subSectionId = `subsection:${sectionCode}|${subSectionCode}`
    let subSectionNode = sectionNode.children?.find(node => node.id === subSectionId)
    if (!subSectionNode) {
      subSectionNode = {
        id: subSectionId,
        label: subSectionLabel,
        icon: 'i-lucide-files',
        defaultExpanded: true,
        children: []
      }
      sectionNode.children?.push(subSectionNode)
    }

    subSectionNode.children?.push({
      id: `question:${item.value}`,
      label: questionLabel,
      value: item.value,
      icon: 'i-lucide-circle-help'
    })
  })

  return Array.from(sections.values())
}

export const formatAssessmentFixedWeightDisplay = (value: number | null) => {
  if (value === null) {
    return ''
  }

  const normalized = String(value)
  const [integerPart = '', decimalPart = ''] = normalized.split('.')

  if (!decimalPart) {
    if (normalized.length <= 2) {
      return normalized
    }

    return `${normalized.slice(0, 2)}...`
  }

  if (decimalPart.length <= 2) {
    return normalized
  }

  return `${integerPart}.${decimalPart.slice(0, 2)}...`
}

export type AssessmentWeightSummaryRow = {
  key: string
  label: string
  weight: number | null
}

const getItemWeightSummaryRow = (
  section: AssessmentSectionRow,
  subSection: AssessmentSubSectionRow,
  item: AssessmentItemRow,
  subSectionIndex: number,
  itemIndex: number
): AssessmentWeightSummaryRow => ({
  key: `${section._key}|${subSection._key}|${item._key}`,
  label: `${subSectionIndex + 1}.${itemIndex + 1} ${getAssessmentDisplayLabel(item.question, item.name)}`,
  weight: getAssessmentFixedWeight(item.weight)
})

export const buildAssessmentWeightSummary = (state: AssessmentDefinitionEditorState) => ({
  sections: state.sections.map((section, sectionIndex) => ({
    key: section._key,
    indexLabel: String(sectionIndex + 1).padStart(2, '0'),
    label: getAssessmentDisplayLabel(section.label, section.name),
    weight: section.weight,
    subSections: section.subSections.map((subSection, subSectionIndex) => ({
      key: subSection._key,
      label: getAssessmentDisplayLabel(subSection.label, subSection.name),
      weight: getAssessmentFixedWeight(subSection.weight),
      items: subSection.questions.map((item, itemIndex) => (
        getItemWeightSummaryRow(section, subSection, item, subSectionIndex, itemIndex)
      ))
    }))
  })),
  sectionWeightTotal: state.sections.reduce((total, section) => total + Number(section.weight || 0), 0),
  impactorWeightTotal: state.impactors.reduce((total, impactor) => total + Number(impactor.weight || 0), 0)
})

export const getAssessmentImpactorLabel = (impactor: AssessmentImpactorRow, fallback: string) => {
  const label = getAssessmentDisplayLabel(impactor.label)
  if (label) {
    return label
  }

  const dependencyLabel = formatAssessmentDependencyTarget(impactor.on)
  if (dependencyLabel) {
    return dependencyLabel
  }

  return fallback
}
