/* eslint-disable jsdoc/require-jsdoc -- exported editor helpers are self-descriptive */
import { nanoid } from 'nanoid'
import { ASSESSMENT_CALCULATION_OPERATORS } from '~~/shared/types/schemas/assessment/calculation'
import type { AssessmentCalculationExpression } from '~~/shared/types/schemas/assessment/calculation'

type LabelValue = {
  en: string
  fr: string
}

type Keyed = {
  _key: string
}

export type KeyValueScoreRow = Keyed & {
  key: string
  value: number
}

export type AssessmentBandRow = Keyed & {
  max: number
  label: LabelValue
  indicator: string
}

export type AssessmentHelpRow = Keyed & {
  title: LabelValue
  description: LabelValue
}

export type AssessmentOptionRow = Keyed & {
  value: number
  label: LabelValue
  description: LabelValue
}

export type AssessmentQuestionRow = Keyed & {
  type: 'question'
  name: string
  question: LabelValue
  weight: unknown
  commentThreshold: { min: number, max: number }
  options: AssessmentOptionRow[]
  help: AssessmentHelpRow[]
  depends?: unknown
  assistance?: 'fundingHistory'
}

export type AssessmentCalculationRow = Keyed & {
  type: 'calculation'
  name: string
  question: LabelValue
  weight: unknown
  help: AssessmentHelpRow[]
  depends?: unknown
  formula: AssessmentCalculationExpression
}

export type AssessmentItemRow = AssessmentQuestionRow | AssessmentCalculationRow

export type AssessmentSubSectionRow = Keyed & {
  number: string
  name: string
  weight: unknown
  label: LabelValue
  questions: AssessmentItemRow[]
  depends?: unknown
}

export type AssessmentSectionRow = Keyed & {
  weight: number
  number: string
  label: LabelValue
  name: string
  icon: string
  subSections: AssessmentSubSectionRow[]
}

export type AssessmentOutcomeOptionRow = Keyed & {
  max: number
  value: string
  label: LabelValue
}

export type AssessmentOutcomeStrategyRow = Keyed & {
  name: string
  label: LabelValue
  options: AssessmentOutcomeOptionRow[]
}

export type AssessmentOutcomeRow = Keyed & {
  label: LabelValue
  name: string
  strategies: AssessmentOutcomeStrategyRow[]
}

export type AssessmentImpactorRow = Keyed & {
  weight: number
  on: unknown
  scoringMatrix: Array<Keyed & { max: number, value: number }>
  label: LabelValue
}

export type AssessmentDefinitionEditorState = {
  helpers?: Record<string, unknown>
  sectionMatrix: AssessmentBandRow[]
  outcomes: AssessmentOutcomeRow[]
  impactors: AssessmentImpactorRow[]
  sections: AssessmentSectionRow[]
}

const DEFAULT_ASSESSMENT_CALCULATION_EXPRESSION: AssessmentCalculationExpression = {
  kind: 'operation',
  operator: 'sum',
  args: [{ kind: 'number', value: 0 }]
}

const cloneAssessmentCalculationExpression = (
  value: AssessmentCalculationExpression
): AssessmentCalculationExpression => {
  if (value.kind === 'operation') {
    return {
      kind: 'operation',
      operator: value.operator,
      args: value.args.map(cloneAssessmentCalculationExpression)
    }
  }

  if (value.kind === 'answer') {
    return {
      kind: 'answer',
      section: value.section,
      subsection: value.subsection,
      question: value.question
    }
  }

  if (value.kind === 'helper') {
    return {
      kind: 'helper',
      field: value.field
    }
  }

  return { ...value }
}

const cloneDefaultAssessmentCalculationExpression = (): AssessmentCalculationExpression => (
  cloneAssessmentCalculationExpression(DEFAULT_ASSESSMENT_CALCULATION_EXPRESSION)
)

const isCalculationReferenceExpression = (
  candidate: Record<string, unknown>
): boolean => {
  if (candidate.kind === 'answer') {
    return typeof candidate.section === 'string'
      && typeof candidate.subsection === 'string'
      && typeof candidate.question === 'string'
  }

  if (candidate.kind === 'helper') {
    return typeof candidate.field === 'string'
  }

  return false
}

const isCalculationOperationExpression = (
  candidate: Record<string, unknown>
): boolean => candidate.kind === 'operation'
  && typeof candidate.operator === 'string'
  && ASSESSMENT_CALCULATION_OPERATORS.some(operator => operator === candidate.operator)
  && Array.isArray(candidate.args)
  && candidate.args.every(isAssessmentCalculationExpression)

const isAssessmentCalculationExpression = (value: unknown): value is AssessmentCalculationExpression => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>

  if (candidate.kind === 'number') {
    return typeof candidate.value === 'number'
  }

  if (candidate.kind === 'boolean') {
    return typeof candidate.value === 'boolean'
  }

  return isCalculationReferenceExpression(candidate) || isCalculationOperationExpression(candidate)
}

const toLabelValue = (value: unknown): LabelValue => {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    en: String(source.en ?? ''),
    fr: String(source.fr ?? '')
  }
}

const toRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)

const createBandRow = (value?: Partial<AssessmentBandRow>): AssessmentBandRow => ({
  _key: nanoid(),
  max: Number(value?.max ?? 0),
  label: value?.label ?? { en: '', fr: '' },
  indicator: value?.indicator ?? '#16A34A'
})

const createHelpRow = (value?: Partial<AssessmentHelpRow>): AssessmentHelpRow => ({
  _key: nanoid(),
  title: value?.title ?? { en: '', fr: '' },
  description: value?.description ?? { en: '', fr: '' }
})

const createOptionRow = (value?: Partial<AssessmentOptionRow>): AssessmentOptionRow => ({
  _key: nanoid(),
  value: Number(value?.value ?? 0),
  label: value?.label ?? { en: '', fr: '' },
  description: value?.description ?? { en: '', fr: '' }
})

const normalizeHelpRows = (value: unknown): AssessmentHelpRow[] => Array.isArray(value)
  ? value.map((item) => {
      const row = toRecord(item)
      return createHelpRow({
        title: toLabelValue(row.title),
        description: toLabelValue(row.description)
      })
    })
  : []

const normalizeOptionRows = (value: unknown): AssessmentOptionRow[] => Array.isArray(value)
  ? value.map((item) => {
      const row = toRecord(item)
      return createOptionRow({
        value: Number(row.value ?? 0),
        label: toLabelValue(row.label),
        description: toLabelValue(row.description)
      })
    })
  : []

const getNormalizedItemBase = (item: Record<string, unknown>) => ({
  _key: nanoid(),
  name: String(item.name ?? ''),
  question: toLabelValue(item.question),
  weight: item.weight ?? { adjustable: false, weight: 0 },
  help: normalizeHelpRows(item.help),
  depends: item.depends
})

const getNormalizedCommentThreshold = (item: Record<string, unknown>) => {
  const threshold = item.commentThreshold as Record<string, unknown> | undefined

  return {
    min: Number(threshold?.min ?? 0),
    max: Number(threshold?.max ?? 0)
  }
}

const normalizeItemRow = (value: unknown): AssessmentItemRow => {
  const item = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  if (item.type === 'calculation') {
    return {
      ...getNormalizedItemBase(item),
      type: 'calculation',
      formula: isAssessmentCalculationExpression(item.formula)
        ? cloneAssessmentCalculationExpression(item.formula)
        : cloneDefaultAssessmentCalculationExpression()
    }
  }

  return {
    ...getNormalizedItemBase(item),
    type: 'question',
    commentThreshold: getNormalizedCommentThreshold(item),
    options: normalizeOptionRows(item.options),
    assistance: item.assistance === 'fundingHistory' ? 'fundingHistory' : undefined
  }
}

const normalizeSubSectionRows = (value: unknown): AssessmentSubSectionRow[] => Array.isArray(value)
  ? value.map(item => {
      const row = toRecord(item)
      return {
        _key: nanoid(),
        number: String(row.number ?? ''),
        name: String(row.name ?? ''),
        weight: row.weight ?? { adjustable: false, weight: 0 },
        label: toLabelValue(row.label),
        questions: Array.isArray(row.questions) ? row.questions.map(normalizeItemRow) : [],
        depends: row.depends
      }
    })
  : []

const normalizeSectionRows = (value: unknown): AssessmentSectionRow[] => Array.isArray(value)
  ? value.map(item => {
      const row = toRecord(item)
      return {
        _key: nanoid(),
        weight: Number(row.weight ?? 0),
        number: String(row.number ?? ''),
        label: toLabelValue(row.label),
        name: String(row.name ?? ''),
        icon: String(row.icon ?? ''),
        subSections: normalizeSubSectionRows(row.subSections)
      }
    })
  : []

const normalizeOutcomes = (value: unknown): AssessmentOutcomeRow[] => Array.isArray(value)
  ? value.map(item => {
      const outcome = toRecord(item)
      return {
        _key: nanoid(),
        label: toLabelValue(outcome.label),
        name: String(outcome.name ?? ''),
        strategies: Array.isArray(outcome.strategies)
          ? outcome.strategies.map(strategy => {
              const current = toRecord(strategy)
              return {
                _key: nanoid(),
                name: String(current.name ?? ''),
                label: toLabelValue(current.label),
                options: Array.isArray(current.options)
                  ? current.options.map(option => {
                      const currentOption = toRecord(option)
                      return {
                        _key: nanoid(),
                        max: Number(currentOption.max ?? 0),
                        value: String(currentOption.value ?? ''),
                        label: toLabelValue(currentOption.label)
                      }
                    })
                  : []
              }
            })
          : []
      }
    })
  : []

const normalizeImpactors = (value: unknown): AssessmentImpactorRow[] => Array.isArray(value)
  ? value.map(item => {
      const impactor = toRecord(item)
      return {
        _key: nanoid(),
        weight: Number(impactor.weight ?? 0),
        on: impactor.on ?? { type: 'helpers', field: '' },
        scoringMatrix: Array.isArray(impactor.scoringMatrix)
          ? impactor.scoringMatrix.map(score => {
              const current = toRecord(score)
              return {
                _key: nanoid(),
                max: Number(current.max ?? 0),
                value: Number(current.value ?? 0)
              }
            })
          : [],
        label: toLabelValue(impactor.label)
      }
    })
  : []

export const normalizeBandRows = (value: unknown): AssessmentBandRow[] => Array.isArray(value)
  ? value.map(item => {
      const row = toRecord(item)
      const indicator = String(row.indicator ?? '').trim()
      return createBandRow({
        max: Number(row.max ?? 0),
        label: toLabelValue(row.label),
        indicator: indicator || '#16A34A'
      })
    })
  : []

const stripEditorKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripEditorKeys)
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(source)) {
      if (key === '_key') {
        continue
      }

      result[key] = stripEditorKeys(item)
    }

    return result
  }

  return value
}

export const createAssessmentBandRow = (): AssessmentBandRow => createBandRow()
export const createAssessmentHelpRow = (): AssessmentHelpRow => createHelpRow()
export const createAssessmentOptionRow = (): AssessmentOptionRow => createOptionRow()
export const createAssessmentQuestionRow = (): AssessmentQuestionRow => ({
  _key: nanoid(),
  type: 'question',
  name: '',
  question: { en: '', fr: '' },
  weight: { adjustable: false, weight: 0 },
  commentThreshold: { min: 0, max: 0 },
  options: [],
  help: []
})
export const createAssessmentCalculationRow = (): AssessmentCalculationRow => ({
  _key: nanoid(),
  type: 'calculation',
  name: '',
  question: { en: '', fr: '' },
  weight: { adjustable: false, weight: 0 },
  help: [],
  formula: cloneDefaultAssessmentCalculationExpression()
})
export const createAssessmentSubSectionRow = (): AssessmentSubSectionRow => ({
  _key: nanoid(),
  number: '',
  name: '',
  weight: { adjustable: false, weight: 0 },
  label: { en: '', fr: '' },
  questions: []
})
export const createAssessmentSectionRow = (): AssessmentSectionRow => ({
  _key: nanoid(),
  weight: 0,
  number: '',
  label: { en: '', fr: '' },
  name: '',
  icon: '',
  subSections: []
})
export const createAssessmentOutcomeRow = (): AssessmentOutcomeRow => ({
  _key: nanoid(),
  label: { en: '', fr: '' },
  name: '',
  strategies: []
})
export const createAssessmentOutcomeStrategyRow = (): AssessmentOutcomeStrategyRow => ({
  _key: nanoid(),
  name: '',
  label: { en: '', fr: '' },
  options: []
})
export const createAssessmentOutcomeOptionRow = (): AssessmentOutcomeOptionRow => ({
  _key: nanoid(),
  max: 0,
  value: '',
  label: { en: '', fr: '' }
})
export const createAssessmentImpactorRow = (): AssessmentImpactorRow => ({
  _key: nanoid(),
  weight: 0,
  on: { type: 'helpers', field: '' },
  scoringMatrix: [],
  label: { en: '', fr: '' }
})
export const createKeyValueScoreRow = (): KeyValueScoreRow => ({
  _key: nanoid(),
  key: '',
  value: 0
})

export const normalizeAssessmentDefinitionEditorState = (value: unknown): AssessmentDefinitionEditorState => {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    helpers: source.helpers && typeof source.helpers === 'object' && !Array.isArray(source.helpers)
      ? source.helpers as Record<string, unknown>
      : undefined,
    sectionMatrix: normalizeBandRows(source.sectionMatrix),
    outcomes: normalizeOutcomes(source.outcomes),
    impactors: normalizeImpactors(source.impactors),
    sections: normalizeSectionRows(source.sections)
  }
}

export const serializeAssessmentDefinitionEditorState = (value: AssessmentDefinitionEditorState) => {
  const serialized = stripEditorKeys(value) as Record<string, unknown>
  if (!Array.isArray(serialized.impactors)) {
    return serialized
  }

  serialized.impactors = serialized.impactors.map(item => {
    const impactor = item as Record<string, unknown>
    const label = impactor.label as Record<string, unknown> | undefined
    if (
      String(label?.en ?? '').trim().length > 0
      || String(label?.fr ?? '').trim().length > 0
    ) {
      return impactor
    }

    const impactorWithoutLabel = { ...impactor }
    delete impactorWithoutLabel.label
    return impactorWithoutLabel
  })

  return serialized
}

export const normalizeScoringRecordRows = (value: unknown): KeyValueScoreRow[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => ({
    _key: nanoid(),
    key,
    value: Number(currentValue ?? 0)
  }))
}

export const serializeScoringRecordRows = (rows: KeyValueScoreRow[]) => rows.reduce<Record<string, number>>((acc, row) => {
  const normalizedKey = row.key.trim()
  if (!normalizedKey) {
    return acc
  }

  acc[normalizedKey] = Number(row.value)
  return acc
}, {})
