import type { ReviewSchemaContentSource } from './review-schema-versioning'
import { getReviewSchemaEffectiveContent } from './review-schema-versioning'
import type { ZodIssue } from 'zod'
import type { AssessmentDefinition, ScoringMatrixItem } from '~~/shared/types/schemas/assessment/assessment'
import {
  AssessmentDefinitionSchema,
  AssessmentScoringMatrixSchema
} from '~~/shared/types/schemas/assessment/assessment'

export type AssessmentRuntimeSchema = AssessmentDefinition & {
  scoringMatrix: ScoringMatrixItem[]
}

/** Error raised when authored assessment content cannot be safely normalized. */
export class InvalidPersistedAssessmentDefinitionError extends Error {
  /** Validation issues suitable for diagnostics without exposing them as an unhandled error. */
  readonly issues: ZodIssue[]

  /**
   * Creates a persisted assessment corruption error.
   *
   * @param issues - Validation issues reported for the persisted content.
   */
  constructor(issues: ZodIssue[]) {
    super('Persisted assessment definition is invalid')
    this.name = 'InvalidPersistedAssessmentDefinitionError'
    this.issues = issues
  }
}

/**
 * Creates the runtime fallback used when no assessment definition has been authored.
 *
 * @returns An empty assessment definition.
 */
const emptyAssessmentDefinition = (): AssessmentDefinition => ({
  sections: [],
  sectionMatrix: [],
  outcomes: []
})

/**
 * Checks whether a value is an empty object.
 *
 * @param value - Candidate value.
 * @returns True when the value is a plain empty object.
 */
const isEmptyRecord = (value: unknown): boolean => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.keys(value).length === 0
)

/**
 * Checks whether persisted content represents an unauthored assessment definition.
 *
 * @param value - Candidate persisted content.
 * @returns True only when no assessment definition content has been authored.
 */
const isUnauthoredAssessmentDefinition = (value: unknown): boolean => {
  if (value === null || isEmptyRecord(value)) {
    return true
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return false
}

/**
 * Safely parses persisted assessment definition content for runtime use.
 *
 * @param value - Raw persisted assessment schema content.
 * @returns Validated assessment definition or an empty fallback for absent content.
 */
const parseAssessmentDefinition = (value: unknown): AssessmentDefinition => {
  if (isUnauthoredAssessmentDefinition(value)) {
    return emptyAssessmentDefinition()
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('sections' in value)) {
    const result = AssessmentDefinitionSchema.safeParse(value)
    throw new InvalidPersistedAssessmentDefinitionError(result.success ? [] : result.error.issues)
  }

  const record = value as Record<string, unknown>
  const result = AssessmentDefinitionSchema.safeParse({
    ...record,
    sectionMatrix: record.sectionMatrix ?? [],
    outcomes: record.outcomes ?? []
  })
  if (!result.success) throw new InvalidPersistedAssessmentDefinitionError(result.error.issues)
  return result.data
}

/**
 * Safely parses persisted scoring matrix content for runtime use.
 *
 * @param value - Raw persisted scoring matrix content.
 * @returns Validated scoring matrix rows, with absent content treated as unauthored.
 */
const parseScoringMatrix = (value: unknown): ScoringMatrixItem[] => {
  if (value === null || value === undefined || isEmptyRecord(value)) {
    return []
  }

  const result = AssessmentScoringMatrixSchema.safeParse(value)
  if (!result.success) throw new InvalidPersistedAssessmentDefinitionError(result.error.issues)
  return result.data
}

/**
 * Resolves the effective assessment schema version into a validated runtime schema.
 *
 * @param schemaContentSource - Review schema row content including draft and published versions.
 * @returns Runtime-safe assessment schema content.
 */
export const normalizeAssessmentRuntimeSchema = (schemaContentSource: ReviewSchemaContentSource): AssessmentRuntimeSchema => {
  const effectiveContent = getReviewSchemaEffectiveContent(schemaContentSource)
  const definition = parseAssessmentDefinition(effectiveContent.assessmentSchema)

  return {
    ...definition,
    scoringMatrix: parseScoringMatrix(effectiveContent.scoringMatrix)
  }
}
