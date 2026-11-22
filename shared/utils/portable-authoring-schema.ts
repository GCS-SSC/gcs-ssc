/* eslint-disable jsdoc/require-jsdoc -- portable schema declarations describe the interchange format. */
import { z } from 'zod'
import { AgencyProfileSchema } from '../types/schemas/agency'
import { AgencyReviewSchemaCreateSchema, CommonRecommendationSchemaCreateSchema } from '../types/schemas/admin-common'
import { ApprovalTemplateCreateSchema, ApprovalTemplateStepBaseSchema } from '../types/schemas/approval-template'
import { AssessmentDefinitionSchema, AssessmentScoringMatrixSchema } from '../types/schemas/assessment/assessment'
import { ChecklistDefinitionSchema } from '../types/schemas/checklist/checklist'
import { CORE_DIRECT_REVIEW_ENTITY_TYPE_ENUM } from '../constants/entity-registry'

export const portableAuthoringKinds = ['checklist', 'assessment', 'recommendation', 'approval'] as const
export type PortableAuthoringKind = typeof portableAuthoringKinds[number]

const StorageText = AgencyProfileSchema.shape.egcs_ay_name_en
export const ReviewAuthoringText = {
  egcs_cn_name_en: AgencyReviewSchemaCreateSchema.shape.egcs_cn_name_en.trim().min(1, { error: 'validation.name_en_required' }).pipe(StorageText),
  egcs_cn_name_fr: AgencyReviewSchemaCreateSchema.shape.egcs_cn_name_fr.trim().min(1, { error: 'validation.name_fr_required' }).pipe(StorageText),
  egcs_cn_outcomename_en: AgencyReviewSchemaCreateSchema.shape.egcs_cn_outcomename_en.trim().min(1, { error: 'validation.outcome_name_en_required' }).pipe(StorageText),
  egcs_cn_outcomename_fr: AgencyReviewSchemaCreateSchema.shape.egcs_cn_outcomename_fr.trim().min(1, { error: 'validation.outcome_name_fr_required' }).pipe(StorageText)
}
export const AssessmentAuthoringDefinitionSchema = z.union([AssessmentDefinitionSchema, z.object({}).strict()])
export const ReviewAuthoringCreateSchema = AgencyReviewSchemaCreateSchema.extend({
  ...ReviewAuthoringText,
  egcs_cn_scoringmatrix: AssessmentScoringMatrixSchema.optional(),
  egcs_cn_assessmentschema: AssessmentAuthoringDefinitionSchema.optional(),
  egcs_cn_checklistschema: ChecklistDefinitionSchema.optional(),
  egcs_cn_disablecustomoutcomes: z.boolean().optional().default(false),
  egcs_cn_disablealignment: z.boolean().optional().default(false),
  egcs_cn_disablereviewers: z.boolean().optional().default(false)
}).strict()

export const RecommendationAuthoringCreateSchema = CommonRecommendationSchemaCreateSchema.omit({ egcs_cn_agency: true }).strict()

const ChecklistPayload = ReviewAuthoringCreateSchema.omit({
  egcs_cn_reviewtype: true,
  egcs_cn_scoringmatrix: true,
  egcs_cn_assessmentschema: true,
  egcs_cn_disablecustomoutcomes: true,
  egcs_cn_disablealignment: true
}).extend({ egcs_cn_checklistschema: ChecklistDefinitionSchema })

const AssessmentPayload = ReviewAuthoringCreateSchema.omit({
  egcs_cn_reviewtype: true,
  egcs_cn_checklistschema: true
}).extend({
  egcs_cn_scoringmatrix: AssessmentScoringMatrixSchema,
  egcs_cn_assessmentschema: AssessmentDefinitionSchema
})

// Resolve missing assignee references before enforcing the create invariant.
const ApprovalPayload = ApprovalTemplateCreateSchema.safeExtend({ steps: z.array(ApprovalTemplateStepBaseSchema) })
const envelope = <Kind extends PortableAuthoringKind, Payload extends z.ZodType>(kind: Kind, payload: Payload) => z.strictObject({
  version: z.literal(1),
  kind: z.literal(kind),
  payload
})

const schemas = {
  checklist: envelope('checklist', ChecklistPayload),
  assessment: envelope('assessment', AssessmentPayload),
  recommendation: envelope('recommendation', RecommendationAuthoringCreateSchema),
  approval: envelope('approval', ApprovalPayload)
}
export const PortableAuthoringSchema = z.discriminatedUnion('kind', [schemas.checklist, schemas.assessment, schemas.recommendation, schemas.approval])
export type PortableAuthoringSchema = z.infer<typeof PortableAuthoringSchema>

export const PortableAuthoringNoticeSchema = z.strictObject({
  message: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(500).optional()
})
export type PortableAuthoringNotice = z.infer<typeof PortableAuthoringNoticeSchema>
export const PortableAuthoringRemovalSchema = z.strictObject({ path: z.string(), reference: z.string() })
export const PortableAuthoringImportOptions = z.strictObject({
  requestId: z.uuid(),
  confirmedRemovals: z.array(PortableAuthoringRemovalSchema).default([]),
  notices: z.array(PortableAuthoringNoticeSchema).max(100).default([])
})

export const PortableReviewImportSchema = z.strictObject({
  portable: z.discriminatedUnion('kind', [schemas.checklist, schemas.assessment]),
  importOptions: PortableAuthoringImportOptions
})
export const PortableRecommendationImportSchema = z.strictObject({
  portable: schemas.recommendation,
  importOptions: PortableAuthoringImportOptions
})
export const PortableApprovalImportSchema = z.strictObject({
  portable: schemas.approval,
  importOptions: PortableAuthoringImportOptions
})

export const portableSchemaJsonSchema = (kind: PortableAuthoringKind) => {
  const schema = z.toJSONSchema(schemas[kind], {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'any',
    cycles: 'ref'
  })
  if (kind !== 'checklist' && kind !== 'assessment') return schema
  const payload = schema.properties?.payload
  if (payload && typeof payload === 'object' && payload.properties) {
    payload.properties.egcs_cn_entitytype = { type: 'string', enum: [...CORE_DIRECT_REVIEW_ENTITY_TYPE_ENUM] }
  }
  return schema
}

export const PortableAuthoringImportReportSchema = z.strictObject({
  id: z.string(),
  removed: z.array(PortableAuthoringRemovalSchema),
  notices: z.array(PortableAuthoringNoticeSchema)
})
export type PortableAuthoringImportReport = z.infer<typeof PortableAuthoringImportReportSchema>

export const createPortableAuthoringExport = (kind: PortableAuthoringKind, record: Record<string, unknown>): PortableAuthoringSchema => {
  switch (kind) {
    case 'checklist':
      return { version: 1, kind, payload: ChecklistPayload.strip().parse(record) }
    case 'assessment':
      return {
        version: 1,
        kind,
        payload: AssessmentPayload.strip().parse({
          ...record,
          egcs_cn_scoringmatrix: record.egcs_cn_scoringmatrix ?? [],
          egcs_cn_assessmentschema: typeof record.egcs_cn_assessmentschema === 'object' && record.egcs_cn_assessmentschema !== null && Object.keys(record.egcs_cn_assessmentschema).length > 0
            ? record.egcs_cn_assessmentschema
            : { sections: [], sectionMatrix: [], outcomes: [] }
        })
      }
    case 'recommendation':
      return { version: 1, kind, payload: RecommendationAuthoringCreateSchema.strip().parse(record) }
    case 'approval':
      return { version: 1, kind, payload: ApprovalPayload.strip().parse(record) }
  }
}
