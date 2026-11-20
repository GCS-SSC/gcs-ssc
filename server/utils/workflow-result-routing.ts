/* eslint-disable jsdoc/require-jsdoc -- Captures pinned predecessor results immediately before step admission. */
import { sql, type Selectable, type Transaction } from 'kysely'
import { z } from 'zod'
import type { Database } from '~~/shared/types/database'
import type { WorkflowResultCondition } from '~~/shared/types/schemas/agreement-custom-fields'
import { CHECKLIST_RESULTS } from '~~/shared/types/schemas/checklist/checklist'
import { matchWorkflowResult } from '~~/shared/types/schemas/workflow-result-matching'
import { parseSafeDecimal } from '~~/shared/utils/decimal'
import { isWorkflowResultCondition, WorkflowResultConditionSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import type { PublishedWorkflowConfiguration, PublishedWorkflowMember } from './workflow-setup-versioning'

const ResultEvidenceSchema = z.object({
  condition: WorkflowResultConditionSchema,
  name_en: z.string(),
  name_fr: z.string(),
  matched: z.boolean(),
  actual: z.union([z.number(), z.boolean(), z.enum(CHECKLIST_RESULTS)]).nullable(),
  sourceRuntimeItemId: z.string().nullable()
})
const ResultDecisionsSchema = z.record(z.string(), z.array(ResultEvidenceSchema))
type ResultEvidence = z.infer<typeof ResultEvidenceSchema>
type WorkflowResultDecisions = z.infer<typeof ResultDecisionsSchema>
export const readWorkflowResultDecisions = (evidence: unknown): WorkflowResultDecisions =>
  evidence == null ? {} : ResultDecisionsSchema.parse(evidence)

type RuntimeItem = Selectable<Database['Common_Runtime_Item']>
const unavailableResult = { actual: null, sourceRuntimeItemId: null }

const readResult = async (
  trx: Transaction<Database>, runId: string, parent: RuntimeItem,
  source: PublishedWorkflowMember, condition: WorkflowResultCondition
): Promise<Pick<ResultEvidence, 'actual' | 'sourceRuntimeItemId'>> => {
  const children = trx.selectFrom('Common_Runtime_Item as child')
    .where('child.egcs_cn_runtime', '=', runId)
    .where('child.egcs_cn_parentruntimeitem', '=', String(parent.id))
    .where('child.egcs_cn_state', 'in', ['succeeded', 'approved'])
    .where('child._deleted', '=', false)
  if (condition.source === 'recommendation_result') {
    const nested = source.recommendationPlan?.members.find(member => member.memberId === condition.nestedMemberId)
    if (!nested) return unavailableResult
    const row = await children
      .innerJoin('Common_Recommendation as recommendation', 'recommendation.egcs_cn_runtimeitem', 'child.id')
      .select(['child.id', 'recommendation.egcs_cn_outcome as outcome'])
      .where('child.egcs_cn_order', '=', String(nested.order))
      .where('child.egcs_cn_publicationversion', '=', nested.schemaVersionId)
      .where('recommendation.egcs_cn_recommendationsetup', '=', nested.memberId)
      .where('recommendation._deleted', '=', false)
      .executeTakeFirst()
    if (row?.outcome == null) return unavailableResult
    return { actual: row.outcome === 'recommended', sourceRuntimeItemId: String(row.id) }
  }

  const nested = source.reviewPlan?.members.find(member => member.memberId === condition.nestedMemberId)
  if (!nested || nested.reviewType !== (condition.source === 'assessment_score' ? 'assessment' : 'checklist')) return unavailableResult
  const row = await children
    .innerJoin('Common_Review as review', 'review.egcs_cn_runtimeitem', 'child.id')
    .leftJoin('Common_Checklist as checklist', join => join
      .onRef('checklist.egcs_cn_review', '=', 'review.id').on('checklist._deleted', '=', false))
    .select(['child.id', 'review.egcs_cn_reviewresult as score', 'checklist.egcs_cn_result as checklistResult'])
    .where('child.egcs_cn_order', '=', String(nested.order))
    .where('child.egcs_cn_publicationversion', '=', nested.schema.publicationVersionId)
    .where('review._deleted', '=', false)
    .executeTakeFirst()
  if (!row) return unavailableResult
  const actual = condition.source === 'assessment_score'
    ? row.score == null ? null : parseSafeDecimal(String(row.score))
    : row.checklistResult
  if (actual == null) return unavailableResult
  return { actual, sourceRuntimeItemId: String(row.id) }
}

type ResultRead = Pick<ResultEvidence, 'actual' | 'sourceRuntimeItemId'>
type ResultRequest = {
  source: PublishedWorkflowMember
  condition: WorkflowResultCondition
}
type NextStep = {
  member: PublishedWorkflowMember | undefined
  appended: WorkflowResultDecisions
}

/**
 * Traverses the start-filtered plan while the caller supplies predecessor evidence.
 * @param configuration - Published step order with captured start conditions applied.
 * @param completedSequence - Sequence of the last reached step, or zero before start.
 * @param saved - Decisions already recorded for the attempt.
 * @returns The selected member and newly evaluated decisions.
 */
export function* resolveNextWorkflowStep(
  configuration: PublishedWorkflowConfiguration, completedSequence: number, saved: WorkflowResultDecisions = {}
): Generator<ResultRequest, NextStep, ResultRead> {
  const appended: WorkflowResultDecisions = {}
  for (const member of configuration.members) {
    if (member.sequence <= completedSequence) continue
    const predicates = (member.conditions ?? []).filter(
      (condition): condition is typeof condition & WorkflowResultCondition => isWorkflowResultCondition(condition)
    )
    let decisions = saved[member.memberId]
    if (predicates.length && !decisions) {
      decisions = []
      for (const { name_en, name_fr, options: _options, ...condition } of predicates) {
        const source = configuration.members.find(candidate => candidate.memberId === condition.workflowMemberId && candidate.sequence < member.sequence)
        const result = source ? yield { source, condition } : unavailableResult
        decisions.push({
          condition, name_en, name_fr,
          ...result, matched: matchWorkflowResult(condition, result.actual)
        })
      }
      appended[member.memberId] = decisions
    }
    if (!decisions || decisions.every(decision => decision.matched)) return { member, appended }
  }
  return { member: undefined, appended }
}

export const selectNextWorkflowResultStep = async (
  trx: Transaction<Database>, runId: string, configuration: PublishedWorkflowConfiguration,
  completedSequence: number, saved: WorkflowResultDecisions
): Promise<PublishedWorkflowMember | undefined> => {
  const traversal = resolveNextWorkflowStep(configuration, completedSequence, saved)
  let step = traversal.next()
  if (!step.done) {
    const topLevelItems = await trx.selectFrom('Common_Runtime_Item').selectAll()
      .where('egcs_cn_runtime', '=', runId)
      .where('egcs_cn_parentruntimeitem', 'is', null)
      .where('_deleted', '=', false)
      .execute()
    const bySequence = new Map(topLevelItems.map(item => [parseSafeDecimal(String(item.egcs_cn_order)), item]))
    while (!step.done) {
      const { source, condition } = step.value
      const parent = bySequence.get(source.sequence)
      step = traversal.next(parent ? await readResult(trx, runId, parent, source, condition) : unavailableResult)
    }
  }
  const { member, appended } = step.value
  if (Object.keys(appended).length) {
    await trx.updateTable('Common_Workflow_Run')
      .set({ egcs_cn_resultconditions: sql`COALESCE(egcs_cn_resultconditions, '{}'::jsonb) || ${JSON.stringify(appended)}::jsonb` })
      .where('id', '=', runId).executeTakeFirstOrThrow()
  }
  return member
}
