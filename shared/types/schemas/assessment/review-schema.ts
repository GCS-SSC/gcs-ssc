import { z } from 'zod'
import {
  AssessmentDefinitionSchema,
  createAssessmentDefinitionSchemaForEntityType,
  AssessmentScoringMatrixSchema
} from './assessment'
import type { Entity_Type } from '../../database'

const RequiredString = (key: string) => z.string({ error: key }).min(1, { error: key })

export const AssessmentReviewSchemaScoringMatrixSchema = AssessmentScoringMatrixSchema

export const AssessmentReviewSchemaGeneralPatchSchema = z.object({
  egcs_cn_name_en: RequiredString('validation.name_en_required'),
  egcs_cn_name_fr: RequiredString('validation.name_fr_required'),
  egcs_cn_outcomename_en: RequiredString('validation.outcome_name_en_required'),
  egcs_cn_outcomename_fr: RequiredString('validation.outcome_name_fr_required'),
  egcs_cn_disablecustomoutcomes: z.boolean({ error: 'validation.required' }),
  egcs_cn_disablealignment: z.boolean({ error: 'validation.required' }),
  egcs_cn_disablereviewers: z.boolean({ error: 'validation.required' })
})

export const AssessmentReviewSchemaDefinitionPatchSchema = z.object({
  egcs_cn_scoringmatrix: AssessmentReviewSchemaScoringMatrixSchema,
  egcs_cn_assessmentschema: AssessmentDefinitionSchema
})

export const AssessmentReviewSchemaPatchSchema = AssessmentReviewSchemaGeneralPatchSchema
  .partial()
  .merge(AssessmentReviewSchemaDefinitionPatchSchema.partial())

export const createAssessmentReviewSchemaDefinitionPatchSchema = (entityType: Entity_Type) => z.object({
  egcs_cn_scoringmatrix: AssessmentReviewSchemaScoringMatrixSchema,
  egcs_cn_assessmentschema: createAssessmentDefinitionSchemaForEntityType(entityType)
})

export const createAssessmentReviewSchemaPatchSchema = (entityType: Entity_Type) => AssessmentReviewSchemaGeneralPatchSchema
  .partial()
  .merge(createAssessmentReviewSchemaDefinitionPatchSchema(entityType).partial())

export type AssessmentReviewSchemaScoringMatrix = z.infer<typeof AssessmentReviewSchemaScoringMatrixSchema>
export type AssessmentReviewSchemaGeneralPatch = z.infer<typeof AssessmentReviewSchemaGeneralPatchSchema>
export type AssessmentReviewSchemaDefinitionPatch = z.infer<typeof AssessmentReviewSchemaDefinitionPatchSchema>
export type AssessmentReviewSchemaPatch = z.infer<typeof AssessmentReviewSchemaPatchSchema>
