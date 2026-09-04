/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import { nanoid } from 'nanoid'

type DependencyValueType = 'boolean' | 'number' | 'string'
type DependencyMode = 'single' | 'group'

type DependencyOnModel = {
  type: 'helpers'
  field: string
} | {
  type: 'answers'
  section: string
  subsection: string
  question: string
}

export type DependencyTarget = DependencyOnModel

type DependencyBaseModel = {
  on: DependencyOnModel
  value: boolean | number | string
}

export type DependencyClauseUi = {
  id: string
  onType: 'helpers' | 'answers'
  field: string
  section: string
  subsection: string
  question: string
  valueType: DependencyValueType
  booleanValue: boolean
  numberValue: number
  stringValue: string
}

export type DependencyRuleUi = {
  id: string
  mode: DependencyMode
  clauses: DependencyClauseUi[]
}

export type DependencySummaryRow = {
  id: string
  mode: string
  target: string
  value: string
  conditionCount: number
}

type DependencySummaryLabels = {
  trueLabel: string
  falseLabel: string
  groupConditionsLabel: string
  singleConditionLabel: string
}

type FormatDependencyTarget = (value: DependencyTarget) => string

/** Creates an empty dependency clause draft for UI editing. */
export const createDependencyClauseUi = (): DependencyClauseUi => ({
  id: nanoid(),
  onType: 'helpers',
  field: '',
  section: '',
  subsection: '',
  question: '',
  valueType: 'boolean',
  booleanValue: true,
  numberValue: 0,
  stringValue: ''
})

/** Creates a dependency rule draft with one default clause. */
export const createDependencyRuleUi = (): DependencyRuleUi => ({
  id: nanoid(),
  mode: 'single',
  clauses: [createDependencyClauseUi()]
})

/** Infers the editor value type from a serialized dependency value. */
const getDependencyValueType = (value: unknown): DependencyValueType => {
  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  return 'string'
}

const isDependencyBaseModel = (value: unknown): value is DependencyBaseModel => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (!record.on || typeof record.on !== 'object') return false
  const on = record.on as Record<string, unknown>
  if (on.type === 'helpers') return typeof on.field === 'string'
  return on.type === 'answers'
    && typeof on.section === 'string'
    && typeof on.subsection === 'string'
    && typeof on.question === 'string'
}

/** Maps a serialized dependency clause into its UI editing shape. */
const getDependencyClauseFromModel = (value: DependencyBaseModel): DependencyClauseUi => ({
  id: nanoid(),
  onType: value.on.type,
  field: value.on.type === 'helpers' ? value.on.field : '',
  section: value.on.type === 'answers' ? value.on.section : '',
  subsection: value.on.type === 'answers' ? value.on.subsection : '',
  question: value.on.type === 'answers' ? value.on.question : '',
  valueType: getDependencyValueType(value.value),
  booleanValue: typeof value.value === 'boolean' ? value.value : true,
  numberValue: typeof value.value === 'number' ? value.value : 0,
  stringValue: typeof value.value === 'string' ? value.value : ''
})

/** Normalizes a serialized dependency model into rule-based UI state. */
export const getDependencyRulesFromModel = (value: unknown): DependencyRuleUi[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((rule): DependencyRuleUi[] => {
    if (Array.isArray(rule)) {
      const clauses = rule
        .filter(isDependencyBaseModel)
        .map(getDependencyClauseFromModel)

      if (clauses.length === 0) {
        return []
      }

      return [{
        id: nanoid(),
        mode: 'group',
        clauses
      }]
    }

    if (isDependencyBaseModel(rule)) {
      return [{
        id: nanoid(),
        mode: 'single',
        clauses: [getDependencyClauseFromModel(rule)]
      }]
    }

    return []
  })
}

/** Serializes a UI clause back into the persisted dependency model shape. */
const getDependencyBaseModel = (clause: DependencyClauseUi): DependencyBaseModel => {
  const on: DependencyOnModel = clause.onType === 'helpers'
    ? {
        type: 'helpers',
        field: clause.field
      }
    : {
        type: 'answers',
        section: clause.section,
        subsection: clause.subsection,
        question: clause.question
      }

  const value = clause.valueType === 'boolean'
    ? clause.booleanValue
    : clause.valueType === 'number'
      ? Number(clause.numberValue)
      : clause.stringValue

  return { on, value }
}

/** Serializes dependency rules from UI state back into the stored model. */
export const getDependencyModelFromRules = (rules: DependencyRuleUi[]) => {
  const normalized = rules
    .filter(rule => rule.clauses.length > 0)
    .map(rule => {
      const clauses = rule.clauses.map(getDependencyBaseModel)
      return rule.mode === 'group' ? clauses : clauses[0]
    })
    .filter(Boolean)

  return normalized.length > 0 ? normalized : undefined
}

/** Builds a serialized answer-path key from an answers dependency clause. */
export const createAnswersDependencyValue = (clause: Pick<DependencyClauseUi, 'section' | 'subsection' | 'question'>) => {
  if (!clause.section || !clause.subsection || !clause.question) {
    return ''
  }

  return JSON.stringify([clause.section, clause.subsection, clause.question])
}

/** Applies a serialized answer-path key back onto an answers dependency clause. */
export const applyAnswersDependencyValue = (
  clause: Pick<DependencyClauseUi, 'section' | 'subsection' | 'question'>,
  selectedValue: string
) => {
  if (!selectedValue) {
    clause.section = ''
    clause.subsection = ''
    clause.question = ''
    return
  }

  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(selectedValue)
  } catch {
    parsedValue = selectedValue.split('|')
  }

  const [sectionValue = '', subsectionValue = '', questionValue = ''] = Array.isArray(parsedValue)
    ? parsedValue
    : []

  clause.section = sectionValue
  clause.subsection = subsectionValue
  clause.question = questionValue
}

export const createDependencyTargetAnswerPathValue = (target: DependencyTarget): string => {
  if (target.type !== 'answers') {
    return ''
  }

  const section = String(target.section ?? '')
  const subsection = String(target.subsection ?? '')
  const question = String(target.question ?? '')

  if (!section || !subsection || !question) {
    return ''
  }

  return JSON.stringify([section, subsection, question])
}

/** Parses a tree-selection value into an answers dependency target, retaining legacy pipe-delimited support. */
export const parseDependencyTargetAnswerPathValue = (selectedValue: string): DependencyTarget => {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(selectedValue)
  } catch {
    parsedValue = selectedValue.split('|')
  }

  const [section = '', subsection = '', question = ''] = Array.isArray(parsedValue)
    ? parsedValue.map(value => String(value))
    : []

  return { type: 'answers', section, subsection, question }
}

const stringifyDependencySummaryValue = (value: unknown, labels: Pick<DependencySummaryLabels, 'trueLabel' | 'falseLabel'>) => {
  if (typeof value === 'boolean') {
    return value ? labels.trueLabel : labels.falseLabel
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return String(value)
  }

  return ''
}

const getDependencySummaryClauseValue = (clause: DependencyClauseUi) => {
  if (clause.valueType === 'boolean') {
    return clause.booleanValue
  }

  if (clause.valueType === 'number') {
    return clause.numberValue
  }

  return clause.stringValue
}

const getDependencySummaryTarget = (clause: DependencyClauseUi, formatTarget: FormatDependencyTarget) => {
  if (clause.onType === 'helpers') {
    return formatTarget({ type: 'helpers', field: clause.field })
  }

  return formatTarget({
    type: 'answers',
    section: clause.section,
    subsection: clause.subsection,
    question: clause.question
  })
}

/** Builds table summary rows from dependency rules without mutating editor state. */
export const buildDependencySummaryRows = (
  rules: DependencyRuleUi[],
  labels: DependencySummaryLabels,
  formatTarget: FormatDependencyTarget
) => rules.flatMap((rule): DependencySummaryRow[] => {
  const primaryClause = rule.clauses[0]
  if (!primaryClause) {
    return []
  }

  return [{
    id: rule.id,
    mode: rule.mode === 'group' ? labels.groupConditionsLabel : labels.singleConditionLabel,
    target: getDependencySummaryTarget(primaryClause, formatTarget),
    value: stringifyDependencySummaryValue(getDependencySummaryClauseValue(primaryClause), labels),
    conditionCount: rule.clauses.length
  }]
})
