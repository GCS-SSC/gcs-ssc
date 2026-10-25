import { z } from 'zod'
import type { BilingualText, GuideDocument } from './contracts.ts'
import type { GuideExecution, GuideTargetRef } from './actions.ts'

/** The host derives these tasks from current business state; help never records completion. */
export type GuideJourneyTask = {
  id: string
  title: BilingualText
  guideId?: string
  entryTargets?: GuideTargetRef[]
} & ({ status: 'available' } | { status: 'blocked'; blockingReason: BilingualText } | { status: 'completed' })

const identity = z.string().min(1).max(160)
const stageFields = { id: identity, guideStepIds: z.array(identity).max(100) }
export const GuideJourneySchema = z.strictObject({ adapter: identity, stages: z.array(z.discriminatedUnion('kind', [
  z.strictObject({ ...stageFields, kind: z.literal('once') }),
  z.strictObject({ ...stageFields, kind: z.literal('tasks'), taskTemplates: z.array(z.strictObject({ key: identity, guideStepIds: z.array(identity).max(100) })).max(100).optional() })
])).min(1).max(100) })
export type GuideJourney = z.infer<typeof GuideJourneySchema>
export type GuideJourneyDefinition = { adapter: string; label: BilingualText; stages: { id: string; kind: 'once' | 'tasks'; label: BilingualText; taskTemplates?: { key: string; label: BilingualText }[] }[] }
export const GuideJourneyBindingSchema = z.strictObject({ resourceType: identity, resourceId: identity })
export const GuideJourneyCursorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('once'), stageId: identity, stepId: identity }),
  z.strictObject({ kind: z.literal('tasks'), stageId: identity, stepId: identity, taskId: identity })
])
export const GuideJourneySessionSchema = z.strictObject({ binding: GuideJourneyBindingSchema.nullable(), cursor: GuideJourneyCursorSchema.nullable(), executionId: identity.nullable().optional() })
export type GuideJourneyBinding = z.infer<typeof GuideJourneyBindingSchema>
export type GuideJourneyCursor = z.infer<typeof GuideJourneyCursorSchema>
export type GuideJourneySession = z.infer<typeof GuideJourneySessionSchema>
type StageBase = { id: string; title: BilingualText; status: 'available' | 'blocked' | 'completed'; reason?: BilingualText }
export type GuideJourneyStageSnapshot = StageBase & ({ kind: 'once' } | { kind: 'tasks'; tasks: GuideJourneyTask[] })
/** Trusted host projection, refreshed after authorized business operations. */
export type GuideJourneySnapshot = { binding: GuideJourneyBinding | null; execution?: GuideExecution | null; stages: GuideJourneyStageSnapshot[] }

/** Resolve a task's authored template or the stage's general instructions.
 * @param stage Published recipe stage.
 * @param task Current business task supplied by the host.
 * @returns Ordered instruction identities.
 */
export const guideJourneyStepIds = (stage: GuideJourney['stages'][number], task?: GuideJourneyTask): string[] => stage.kind === 'tasks'
  ? stage.taskTemplates?.find(template => template.key === task?.guideId)?.guideStepIds ?? stage.guideStepIds
  : stage.guideStepIds

/** Reconcile against business truth; visiting instructions never completes work.
 * @param document Pinned published recipe.
 * @param snapshot Authorized host state.
 * @param previous Last instruction identity, retained only within the same stage and task.
 * @returns Current stage/task instruction, or null when no work is available.
 */
export const reconcileGuideJourney = (document: GuideDocument, snapshot: GuideJourneySnapshot, previous: GuideJourneyCursor | null = null): GuideJourneyCursor | null => {
  if (previous?.kind === 'tasks') {
    const recipe = document.journey?.stages.find(stage => stage.id === previous.stageId && stage.kind === 'tasks')
    const state = snapshot.stages.find(stage => stage.id === previous.stageId && stage.kind === 'tasks')
    if (!state || state.kind !== 'tasks') return previous
    const task = state.tasks.find(item => item.id === previous.taskId)
    if (!task || task.status !== 'completed') return previous
    if (!recipe) return null
  }
  for (const stage of document.journey?.stages ?? []) {
    const state = snapshot.stages.find(item => item.id === stage.id && item.kind === stage.kind)
    if (!state || state.status !== 'available') {
      if (state?.status === 'completed') continue
      return previous?.stageId === stage.id ? previous : null
    }
    const first = stage.guideStepIds[0]
    if (stage.kind === 'once' && !first) return null
    if (stage.kind === 'once' && first) return { kind: 'once', stageId: stage.id, stepId: previous?.kind === 'once' && previous.stageId === stage.id && stage.guideStepIds.includes(previous.stepId) ? previous.stepId : first }
    if (stage.kind !== 'tasks' || state.kind !== 'tasks' || !snapshot.binding) return null
    const task = state.tasks.find(item => item.status === 'available')
    if (!task) return null
    const stepIds = guideJourneyStepIds(stage, task)
    const taskFirst = stepIds[0]
    if (!taskFirst) return null
    return { kind: 'tasks', stageId: stage.id, taskId: task.id, stepId: previous?.kind === 'tasks' && previous.stageId === stage.id && previous.taskId === task.id && stepIds.includes(previous.stepId) ? previous.stepId : taskFirst }
  }
  return null
}
