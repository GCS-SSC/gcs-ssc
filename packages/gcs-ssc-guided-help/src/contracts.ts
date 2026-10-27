import { z } from 'zod'
import { GuideJourneySchema } from './journey.ts'

const invalid = { error: 'validation.guided_help_document_invalid' }

export const TargetKindSchema = z.enum(['text', 'textarea', 'number', 'money', 'select', 'checkbox', 'date', 'button', 'navigation', 'section'], invalid)
export type TargetKind = z.infer<typeof TargetKindSchema>
export type BilingualText = { en: string; fr: string }

const key = z.string(invalid).min(1, invalid).max(160, invalid).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, invalid)
const text = (max: number) => z.string(invalid).max(max, invalid).refine(value =>
  !value.includes('\0') && !/<\/?[a-z!]|\{\{|<%|\$\{/i.test(value)
  && !/\]\(\s*(?!https?:|mailto:|#|\/(?!\/))[a-z][a-z0-9+.-]*:/i.test(value),
'validation.guided_help_content_invalid')
const bilingual = (max: number) => z.strictObject({ en: text(max), fr: text(max) }, invalid)
const flow = z.strictObject({ next: text(160).nullable(), branches: z.array(z.strictObject({ target: text(160), equals: z.union([text(160), z.boolean(invalid)], invalid), next: text(160).nullable() }, invalid), invalid).max(50, invalid) }, invalid)
const step = z.strictObject({ id: key, view: text(160), target: text(160), kind: TargetKindSchema, appearance: z.enum(['spotlight', 'anchor-only'], invalid).optional(), advanceOn: z.enum(['completion', 'manual'], invalid).optional(), title: bilingual(255), instructions: bilingual(8000), flow: flow.optional() }, invalid)
const base = z.strictObject({ formatVersion: z.literal(1, invalid), title: bilingual(255), description: bilingual(4000), steps: z.array(step, invalid).max(100, invalid), journey: GuideJourneySchema.optional() }, invalid)

export const GuideDraftSchema = base.superRefine((value, ctx) => {
  const ids = new Set<string>()
  value.steps.forEach((item, index) => {
    if (ids.has(item.id)) ctx.addIssue({ code: 'custom', path: ['steps', index, 'id'], message: 'validation.guided_help_duplicate_key' })
    ids.add(item.id)
    for (const field of ['view', 'target'] as const) {
      if (item[field] && !key.safeParse(item[field]).success) ctx.addIssue({ code: 'custom', path: ['steps', index, field], message: 'validation.guided_help_reference_invalid' })
    }
  })
  if (value.journey) {
    const stages = new Set<string>()
    const assigned = new Set<string>()
    for (const stage of value.journey.stages) {
      if (stages.has(stage.id)) ctx.addIssue({ code: 'custom', path: ['journey'], message: 'validation.guided_help_duplicate_key' })
      stages.add(stage.id)
      const templateKeys = new Set<string>()
      for (const template of stage.kind === 'tasks' ? stage.taskTemplates ?? [] : []) {
        if (templateKeys.has(template.key)) ctx.addIssue({ code: 'custom', path: ['journey'], message: 'validation.guided_help_duplicate_key' })
        templateKeys.add(template.key)
      }
      for (const id of [...stage.guideStepIds, ...(stage.kind === 'tasks' ? stage.taskTemplates?.flatMap(template => template.guideStepIds) ?? [] : [])]) {
        if (assigned.has(id) || !ids.has(id)) ctx.addIssue({ code: 'custom', path: ['journey'], message: 'validation.guided_help_reference_invalid' })
        assigned.add(id)
      }
    }
    if (value.steps.some(item => item.flow)) ctx.addIssue({ code: 'custom', path: ['journey'], message: 'validation.guided_help_reference_invalid' })
  }
  if (JSON.stringify(value).length > 256000) ctx.addIssue({ code: 'custom', message: 'validation.guided_help_document_too_large' })
})
export const GuideDocumentSchema = GuideDraftSchema.superRefine((value, ctx) => {
  if (!value.steps.length) ctx.addIssue({ code: 'custom', path: ['steps'], message: 'validation.guided_help_steps_required' })
  /**
   * Require both languages at the publication boundary.
   * @param content Authored bilingual content to validate.
   * @param path Document path for localized validation errors.
   */
  const complete = (content: BilingualText, path: (string | number)[]) => {
    for (const locale of ['en', 'fr'] as const) {
      if (!content[locale].trim()) ctx.addIssue({ code: 'custom', path: [...path, locale], message: 'validation.required' })
    }
  }
  if (value.journey) {
    const assigned = value.journey.stages.flatMap(stage => [...stage.guideStepIds, ...(stage.kind === 'tasks' ? stage.taskTemplates?.flatMap(template => template.guideStepIds) ?? [] : [])])
    if (value.journey.stages.some(stage => !stage.guideStepIds.length || (stage.kind === 'tasks' && stage.taskTemplates?.some(template => !template.guideStepIds.length))) || value.steps.some(item => !assigned.includes(item.id))) ctx.addIssue({ code: 'custom', path: ['journey'], message: 'validation.guided_help_reference_invalid' })
  }
  complete(value.title, ['title'])
  complete(value.description, ['description'])
  value.steps.forEach((item, index) => {
    for (const field of ['view', 'target'] as const) {
      if (!key.safeParse(item[field]).success) ctx.addIssue({ code: 'custom', path: ['steps', index, field], message: 'validation.guided_help_reference_invalid' })
    }
    complete(item.title, ['steps', index, 'title'])
    complete(item.instructions, ['steps', index, 'instructions'])
    if (item.flow) {
      const destinations = [item.flow.next, ...item.flow.branches.map(branch => branch.next)]
      for (const destination of destinations) {
        if (destination !== null && value.steps.findIndex(candidate => candidate.id === destination) <= index) ctx.addIssue({ code: 'custom', path: ['steps', index, 'flow'], message: 'validation.guided_help_reference_invalid' })
      }
      const conditions = new Set<string>()
      item.flow.branches.forEach((branch, branchIndex) => {
        const identity = JSON.stringify([branch.target, branch.equals])
        if (!key.safeParse(branch.target).success || conditions.has(identity)) ctx.addIssue({ code: 'custom', path: ['steps', index, 'flow', 'branches', branchIndex], message: 'validation.guided_help_reference_invalid' })
        conditions.add(identity)
      })
    }
  })
})
export type GuideDocument = z.infer<typeof GuideDocumentSchema>
export type GuideDraft = z.infer<typeof GuideDraftSchema>
export type GuideStep = GuideDocument['steps'][number]

const label = z.strictObject({ en: text(255).refine(value => !!value.trim(), 'validation.required'), fr: text(255).refine(value => !!value.trim(), 'validation.required') }, invalid)
export const GuideCompletionRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('location'), fact: key }, invalid),
  z.strictObject({ kind: z.literal('success'), action: z.enum(['modal-open', 'save-success', 'field-change'], invalid) }, invalid)
])
export type GuideCompletionRule = z.infer<typeof GuideCompletionRuleSchema>
export const TargetLedgerSchema = z.strictObject({
  formatVersion: z.literal(1, invalid),
  views: z.array(z.strictObject({ key, label, discoverable: z.boolean(invalid).optional(), targets: z.array(z.strictObject({ key, label, kind: TargetKindSchema, scope: z.literal('instance', invalid).optional(), completion: GuideCompletionRuleSchema.optional(), choices: z.array(z.strictObject({ value: key, label }, invalid), invalid).min(1, invalid).max(500, invalid).optional() }, invalid), invalid).max(500, invalid) }, invalid), invalid).max(500, invalid)
}, invalid).superRefine((value, ctx) => {
  const views = new Set<string>()
  const definitions = new Map<string, string>()
  value.views.forEach((view, index) => {
    if (views.has(view.key)) ctx.addIssue({ code: 'custom', path: ['views', index, 'key'], message: 'validation.guided_help_duplicate_key' })
    views.add(view.key)
    const targets = new Set<string>()
    view.targets.forEach((target, targetIndex) => {
      if (targets.has(target.key)) ctx.addIssue({ code: 'custom', path: ['views', index, 'targets', targetIndex, 'key'], message: 'validation.guided_help_duplicate_key' })
      targets.add(target.key)
      const definition = JSON.stringify(target)
      const previous = definitions.get(target.key)
      if (previous && previous !== definition) ctx.addIssue({ code: 'custom', path: ['views', index, 'targets', targetIndex], message: 'validation.guided_help_reference_invalid' })
      definitions.set(target.key, definition)
      if (target.choices) {
        const values = new Set<string>()
        if (target.kind !== 'select') ctx.addIssue({ code: 'custom', path: ['views', index, 'targets', targetIndex, 'choices'], message: 'validation.guided_help_reference_invalid' })
        for (const choice of target.choices) {
          if (values.has(choice.value)) ctx.addIssue({ code: 'custom', path: ['views', index, 'targets', targetIndex, 'choices'], message: 'validation.guided_help_duplicate_key' })
          values.add(choice.value)
        }
      }
    })
  })
})
export type TargetLedger = z.infer<typeof TargetLedgerSchema>
export type ContractDiagnostic = { code: string; message: string; view?: string; target?: string; stepId?: string; filename?: string }

/**
 *
 * @returns Structural incompatibilities that prevent guide launch.
 * @param document Validated guide version to check.
 * @param ledger Current supported view and target catalog.
 */
export const checkGuideCompatibility = (document: GuideDocument, ledger: TargetLedger): ContractDiagnostic[] => {
  const diagnostics: ContractDiagnostic[] = []
  for (const step of document.steps) {
    const view = ledger.views.find(item => item.key === step.view)
    const target = view?.targets.find(item => item.key === step.target)
    const code = !view ? 'unknown-view' : !target ? 'unknown-target' : target.kind !== step.kind ? 'kind-mismatch' : null
    if (code) diagnostics.push({ code, view: step.view, target: step.target, stepId: step.id, message: `Guided-help step ${step.id}: ${step.view}/${step.target} expected ${step.kind}; ${code}.` })
    for (const branch of step.flow?.branches ?? []) {
      const condition = view?.targets.find(item => item.key === branch.target)
      const valid = condition?.kind === 'checkbox' ? typeof branch.equals === 'boolean' : condition?.kind === 'select' && typeof branch.equals === 'string' && condition.choices?.some(choice => choice.value === branch.equals)
      if (!valid) diagnostics.push({ code: 'invalid-condition', view: step.view, target: branch.target, stepId: step.id, message: `Guided-help step ${step.id}: ${branch.target} requires a declared structured choice.` })
    }
  }
  return diagnostics
}
export { renderSafeMarkdown } from './markdown.ts'

/** List legal declarative outgoing destinations, including the linear default.
 * @param document Published guide.
 * @param step Source node.
 * @returns Distinct step identities; terminal routes are omitted.
 */
export const guideStepDestinations = (document: GuideDocument, step: GuideStep): string[] => {
  if (step.flow) return [...new Set([step.flow.next, ...step.flow.branches.map(branch => branch.next)].filter((id): id is string => id !== null))]
  const next = document.steps[document.steps.indexOf(step) + 1]
  return next ? [next.id] : []
}

/** Validate tab-local navigation history without storing business field values.
 * @param document Pinned guide.
 * @param path Ordered visited identities.
 * @param stepId Current identity at the end of the path.
 * @returns Whether every transition belongs to the published flow.
 */
export const isGuidePath = (document: GuideDocument, path: unknown, stepId: string): path is string[] => {
  if (!Array.isArray(path) || !path.length || path.length > document.steps.length || path[0] !== document.steps[0]?.id || path.at(-1) !== stepId || new Set(path).size !== path.length) return false
  return path.every((id, index) => typeof id === 'string' && document.steps.some(step => step.id === id) && (index === 0 || guideStepDestinations(document, document.steps.find(step => step.id === path[index - 1])!).includes(id)))
}
