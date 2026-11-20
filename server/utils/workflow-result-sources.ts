/* eslint-disable jsdoc/require-jsdoc -- Published workflow result catalog and source lookup. */
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { WorkflowSimulationInput } from '~~/shared/types/schemas/workflow-simulation'
import { getAssessmentHelperDefinition, referencedAssessmentHelperFields } from '~~/shared/utils/assessment-helpers'
import { normalizeAssessmentRuntimeSchema, type AssessmentRuntimeSchema } from './assessment-runtime-schema'
import { readPublishedReviewSchema } from './review-schema-versioning'
import { readPublishedReviewSetup } from './review-setup-versioning'
import { readPublishedRecommendationPlan } from './recommendation-setup-versioning'
import type { PublishedWorkflowMember } from './workflow-setup-versioning'
import { PublishedDefinitionUnavailableError, readCurrentPublishedDefinition } from './system-publication'

export type WorkflowResultSource = WorkflowSimulationInput & { assessmentSchema?: AssessmentRuntimeSchema }

type ResultPlans = Pick<PublishedWorkflowMember, 'reviewPlan' | 'recommendationPlan'>

export const readWorkflowResultSources = async (
  db: Kysely<Database>, { reviewPlan, recommendationPlan }: ResultPlans,
  projection: 'routing' | 'simulation' = 'routing'
): Promise<WorkflowResultSource[]> => {
  const schemaIds = [...new Set(reviewPlan?.members.map(member => member.schema.publicationVersionId))]
  const versions = schemaIds.length
    ? await db.selectFrom('Common_Publication_Version')
        .select(['id', 'egcs_cn_definition'])
        .where('id', 'in', schemaIds).execute()
    : []
  const definitions = new Map(versions.map(version => [String(version.id), version.egcs_cn_definition]))
  const sources: WorkflowResultSource[] = []
  for (const member of reviewPlan?.members ?? []) {
    const definition = definitions.get(member.schema.publicationVersionId)
    const schema = definition ? readPublishedReviewSchema(definition) : null
    if (!schema || schema.reviewType !== member.reviewType) continue
    const source: WorkflowResultSource = {
      nestedMemberId: member.memberId, nameEn: schema.name.en, nameFr: schema.name.fr,
      source: member.reviewType === 'checklist' ? 'checklist_result' : 'assessment_score'
    }
    if (source.source === 'assessment_score' && projection === 'simulation') {
      source.assessmentSchema = normalizeAssessmentRuntimeSchema({
        egcs_cn_assessmentschema: schema.assessmentSchema,
        egcs_cn_scoringmatrix: schema.scoringMatrix
      })
      source.assessment = {
        helpers: referencedAssessmentHelperFields(schema.assessmentSchema).flatMap(field => {
          const helper = getAssessmentHelperDefinition(reviewPlan!.entityType, field)
          return helper && !helper.retired ? [helper] : []
        }),
        questions: source.assessmentSchema.sections.flatMap(section => section.subSections.flatMap(subsection =>
          subsection.questions.flatMap(question => question.type === 'question'
            ? [{
                section: section.name, subsection: subsection.name, question: question.name,
                nameEn: question.question.en, nameFr: question.question.fr,
                options: question.options.map(option => ({ value: option.value, nameEn: option.label.en, nameFr: option.label.fr }))
              }]
            : [])))
      }
    }
    sources.push(source)
  }
  for (const member of recommendationPlan?.members ?? []) {
    sources.push({
      nestedMemberId: member.memberId, nameEn: member.schemaNameEn, nameFr: member.schemaNameFr,
      source: 'recommendation_result'
    })
  }
  return sources
}

export const readDraftWorkflowResultSources = async (
  db: Kysely<Database>, member: { egcs_cn_reviewset?: string | null, egcs_cn_recommendationset?: string | null }
): Promise<WorkflowResultSource[]> => {
  try {
    const plans: ResultPlans = {}
    if (member.egcs_cn_reviewset) {
      const version = await readCurrentPublishedDefinition(db, String(member.egcs_cn_reviewset), 'review_set_setup')
      plans.reviewPlan = readPublishedReviewSetup(version.definition)
    } else if (member.egcs_cn_recommendationset) {
      const version = await readCurrentPublishedDefinition(db, String(member.egcs_cn_recommendationset), 'recommendation_set_setup')
      plans.recommendationPlan = readPublishedRecommendationPlan(version.definition)
    }
    return await readWorkflowResultSources(db, plans)
  } catch (error) {
    if (error instanceof PublishedDefinitionUnavailableError) return []
    throw error
  }
}
