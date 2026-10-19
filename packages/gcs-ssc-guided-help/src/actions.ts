import { z } from 'zod'
import type { BilingualText } from './contracts'
import { GuideJourneyBindingSchema } from './journey'

const identity = z.string().min(1).max(160)
export const GuideTargetRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unique'), key: identity }),
  z.strictObject({ kind: z.literal('instance'), key: identity, instance: identity })
])
export type GuideTargetRef = z.infer<typeof GuideTargetRefSchema>
const execution = z.strictObject({ binding: GuideJourneyBindingSchema, executionId: identity })
const loaded = { view: identity, facts: z.array(identity).max(100), visitId: identity, draftRevision: z.number().int().nonnegative() }
export const GuideObservedContextSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('pending') }),
  z.strictObject({ kind: z.literal('elsewhere'), view: z.string().max(160) }),
  z.strictObject({ kind: z.literal('owner'), binding: GuideJourneyBindingSchema.nullable(), execution: execution.nullable(), ...loaded }),
  z.strictObject({ kind: z.literal('task'), execution, taskId: identity, ...loaded })
]).superRefine((value, ctx) => {
  if (value.kind === 'owner' && value.execution && (value.binding?.resourceType !== value.execution.binding.resourceType || value.binding.resourceId !== value.execution.binding.resourceId)) ctx.addIssue({ code: 'custom', message: 'Guide owner execution must match its resource binding.' })
})
export type GuideExecution = z.infer<typeof execution>
export type GuideObservedContext = z.infer<typeof GuideObservedContextSchema>
const actionSource = z.strictObject({ target: GuideTargetRefSchema, action: z.enum(['modal-open', 'save-success', 'field-change']), context: GuideObservedContextSchema })
const actionSignal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('selected'), binding: GuideJourneyBindingSchema }),
  z.strictObject({ kind: z.literal('invalidated'), binding: GuideJourneyBindingSchema }),
  z.strictObject({ kind: z.literal('succeeded'), source: actionSource })
])
export type GuideActionSource = z.infer<typeof actionSource>
export type GuideActionSignal = z.infer<typeof actionSignal>
export type GuidePresentation = { target: GuideTargetRef | GuideTargetRef[] | null; view: string; title: BilingualText; instructions: BilingualText }

/** One app-scoped reader lease; released and superseded operations cannot publish.
 * @returns Reader attachment and captured operation callbacks.
 */
export const createGuideActionChannel = () => {
  let active: { receive: (signal: GuideActionSignal) => void } | null = null
  let sequence = 0
  const latest = new Map<string, number>()
  return {
    /** Acquire the sole reader lease.
     * @param receive Current reader’s trusted signal consumer.
     * @returns Release callback, or null when another reader owns the channel.
     */
    attach: (receive: (signal: GuideActionSignal) => void): (() => void) | null => {
      if (active) return null
      const lease = { receive }
      active = lease
      return () => {
        if (active !== lease) return
        active = null
        latest.clear()
      }
    },
    /** Capture an operation before its asynchronous business work begins.
     * @param signal Identity and action to publish only after success.
     * @returns Once-only callback, invalidated by a newer operation or released reader.
     */
    begin: (signal: GuideActionSignal): (() => void) => {
      const owner = active
      if (!owner) return () => undefined
      const captured = actionSignal.parse(signal)
      const key = captured.kind === 'succeeded'
        ? JSON.stringify([captured.kind, captured.source.target, captured.source.action, captured.source.context.kind === 'owner' || captured.source.context.kind === 'task' ? { ...captured.source.context, draftRevision: undefined, facts: undefined, view: undefined } : captured.source.context])
        : captured.kind
      const ticket = ++sequence
      latest.set(key, ticket)
      let settled = false
      return () => {
        if (settled || active !== owner || latest.get(key) !== ticket) return
        settled = true
        latest.delete(key)
        owner.receive(captured)
      }
    }
  }
}
export type GuideActionChannel = ReturnType<typeof createGuideActionChannel>

/**
 * Loaded context identity excludes locale, section and temporary loading.
 * @param context Authorized loaded page state.
 * @returns Exact resource, execution, task, visit and draft identity, or null while unresolved.
 */
export const guideContextIdentity = (context: GuideObservedContext): string | null => context.kind === 'owner' || context.kind === 'task'
  ? JSON.stringify([context.kind === 'owner' ? context.binding?.resourceType : context.execution.binding.resourceType, context.kind === 'owner' ? context.binding?.resourceId : context.execution.binding.resourceId, context.execution?.executionId, context.kind === 'task' ? context.taskId : null, context.visitId, context.draftRevision])
  : null
export const guideTargetIdentity = (target: GuideTargetRef): string => JSON.stringify([target.key, target.kind === 'instance' ? target.instance : null])
export const guideActionKey = (source: GuideActionSource): string => JSON.stringify([guideTargetIdentity(source.target), source.action, guideContextIdentity(source.context)])
