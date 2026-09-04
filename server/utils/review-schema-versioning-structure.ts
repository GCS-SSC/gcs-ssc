/* eslint-disable jsdoc/require-jsdoc */
import type { JsonValue } from '~~/shared/types/database'

type JsonRecord = Record<string, unknown>

export type ReviewSchemaContent = {
  scoringMatrix: JsonValue | null
  assessmentSchema: JsonValue | null
}

type AssessmentSchemaStructure = {
  sectionCount: number
  subSectionCount: number
  questionCount: number
  outcomeCount: number
  impactorCount: number
  sectionNames: string[]
  subSectionNames: string[]
  questionNames: string[]
  outcomeNames: string[]
  impactorKeys: string[]
}

const toRecord = (value: unknown): JsonRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {}
)

const toArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
)

const sortStrings = (values: string[]) => [...values].sort((left, right) => left.localeCompare(right))

const getDependencyKey = (value: unknown) => {
  const dependency = toRecord(value)
  const type = String(dependency.type ?? '')

  if (type === 'helpers') {
    return `helpers:${String(dependency.field ?? '')}`
  }

  if (type === 'answers') {
    return `answers:${String(dependency.section ?? '')}:${String(dependency.subsection ?? '')}:${String(dependency.question ?? '')}`
  }

  return JSON.stringify(value ?? null)
}

const buildAssessmentSchemaStructure = (assessmentSchema: JsonValue | null): AssessmentSchemaStructure => {
  const source = toRecord(assessmentSchema)
  const sections = toArray(source.sections)
  const outcomes = toArray(source.outcomes)
  const impactors = toArray(source.impactors)

  const sectionNames: string[] = []
  const subSectionNames: string[] = []
  const questionNames: string[] = []

  for (const section of sections) {
    const sectionRecord = toRecord(section)
    sectionNames.push(String(sectionRecord.name ?? ''))

    for (const subSection of toArray(sectionRecord.subSections)) {
      const subSectionRecord = toRecord(subSection)
      subSectionNames.push(String(subSectionRecord.name ?? ''))

      for (const question of toArray(subSectionRecord.questions)) {
        const questionRecord = toRecord(question)
        questionNames.push(String(questionRecord.name ?? ''))
      }
    }
  }

  const outcomeNames = outcomes.map(outcome => String(toRecord(outcome).name ?? ''))
  const impactorKeys = impactors.map(impactor => getDependencyKey(toRecord(impactor).on))

  return {
    sectionCount: sections.length,
    subSectionCount: subSectionNames.length,
    questionCount: questionNames.length,
    outcomeCount: outcomeNames.length,
    impactorCount: impactorKeys.length,
    sectionNames: sortStrings(sectionNames),
    subSectionNames: sortStrings(subSectionNames),
    questionNames: sortStrings(questionNames),
    outcomeNames: sortStrings(outcomeNames),
    impactorKeys: sortStrings(impactorKeys)
  }
}

const isSameStringSet = (left: string[], right: string[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

export const isSameReviewSchemaContent = (left: ReviewSchemaContent, right: ReviewSchemaContent) => (
  JSON.stringify(left.scoringMatrix ?? null) === JSON.stringify(right.scoringMatrix ?? null)
  && JSON.stringify(left.assessmentSchema ?? null) === JSON.stringify(right.assessmentSchema ?? null)
)

export const isMinorReviewSchemaVersionChange = (
  currentAssessmentSchema: JsonValue | null,
  nextAssessmentSchema: JsonValue | null
) => {
  const currentStructure = buildAssessmentSchemaStructure(currentAssessmentSchema)
  const nextStructure = buildAssessmentSchemaStructure(nextAssessmentSchema)

  return currentStructure.sectionCount === nextStructure.sectionCount
    && currentStructure.subSectionCount === nextStructure.subSectionCount
    && currentStructure.questionCount === nextStructure.questionCount
    && currentStructure.outcomeCount === nextStructure.outcomeCount
    && currentStructure.impactorCount === nextStructure.impactorCount
    && isSameStringSet(currentStructure.sectionNames, nextStructure.sectionNames)
    && isSameStringSet(currentStructure.subSectionNames, nextStructure.subSectionNames)
    && isSameStringSet(currentStructure.questionNames, nextStructure.questionNames)
    && isSameStringSet(currentStructure.outcomeNames, nextStructure.outcomeNames)
    && isSameStringSet(currentStructure.impactorKeys, nextStructure.impactorKeys)
}

export const getNextSchemaVersion = (currentVersion: number, isMinor: boolean) => {
  let major = Math.trunc(currentVersion)
  let minor = Math.round((currentVersion - major) * 100)

  if (isMinor) {
    minor += 1
    if (minor >= 100) {
      major += 1
      minor = 0
    }
  } else {
    major += 1
    minor = 0
  }

  return Number(((major * 100 + minor) / 100).toFixed(2))
}
