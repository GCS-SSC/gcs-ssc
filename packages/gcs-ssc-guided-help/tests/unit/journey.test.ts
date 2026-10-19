import { describe, expect, it } from 'vitest'
import { GuideDocumentSchema, GuideDraftSchema } from '../../src/contracts'
import { reconcileGuideJourney } from '../../src/journey'
import type { GuideDocument } from '../../src/contracts'
import type { GuideJourneySnapshot } from '../../src/journey'

const text = { en: 'Instruction', fr: 'Instruction' }
const document: GuideDocument = { formatVersion: 1, title: text, description: text, steps: ['select', 'start', 'work', 'finish'].map(id => ({ id, view: 'inventory.detail', target: `inventory.${id}`, kind: 'section', title: text, instructions: text })), journey: { adapter: 'inventory.dispatch', stages: [
  { id: 'choose', kind: 'once', guideStepIds: ['select'] }, { id: 'prepare', kind: 'once', guideStepIds: ['start'] }, { id: 'dispatch', kind: 'tasks', guideStepIds: ['work'] }, { id: 'receipt', kind: 'once', guideStepIds: ['finish'] }
] } }
const snapshot: GuideJourneySnapshot = { binding: { resourceType: 'shipment', resourceId: 'shipment-72' }, stages: [
  { id: 'choose', kind: 'once', title: text, status: 'completed' }, { id: 'prepare', kind: 'once', title: text, status: 'completed' },
  { id: 'dispatch', kind: 'tasks', title: text, status: 'available', tasks: [{ id: 'pack-1', title: text, status: 'available' }, { id: 'label-2', title: text, status: 'blocked', blockingReason: text }] },
  { id: 'receipt', kind: 'once', title: text, status: 'blocked', reason: text }
] }

describe('generic journey recipes', () => {
  it('pins unfinished, blocked and missing tasks across inventory reordering instead of switching to another available task', () => {
    const pinned = reconcileGuideJourney(document, snapshot)!
    const dispatch = snapshot.stages[2]!
    if (dispatch.kind !== 'tasks') throw new Error('Expected tasks')
    for (const tasks of [
      [{ id: 'new-first', title: text, status: 'available' as const }, ...dispatch.tasks],
      dispatch.tasks.map(task => task.id === 'pack-1' ? { ...task, status: 'blocked' as const, blockingReason: text } : task),
      dispatch.tasks.filter(task => task.id !== 'pack-1')
    ]) {
      expect(reconcileGuideJourney(document, { ...snapshot, stages: snapshot.stages.map(stage => stage.id === 'dispatch' ? { ...dispatch, tasks } : stage) }, pinned)).toEqual(pinned)
    }
    expect(reconcileGuideJourney(document, { ...snapshot, stages: [] }, pinned)).toEqual(pinned)
  })
  it('publishes complete stage assignments and rejects ambiguous, missing and branching recipes', () => {
    expect(GuideDocumentSchema.safeParse(document).success).toBe(true)
    for (const stages of [
      [{ id: 'all', kind: 'once', guideStepIds: ['select'] }],
      [{ id: 'a', kind: 'once', guideStepIds: ['select', 'select', 'start', 'work', 'finish'] }],
      [{ id: 'a', kind: 'once', guideStepIds: ['select', 'start', 'work', 'finish', 'unknown'] }],
      [{ id: 'a', kind: 'once', guideStepIds: ['select', 'start', 'work', 'finish'] }, { id: 'a', kind: 'tasks', guideStepIds: [] }]
    ]) expect(GuideDocumentSchema.safeParse({ ...document, journey: { adapter: 'inventory.dispatch', stages } }).success).toBe(false)
    expect(GuideDocumentSchema.safeParse({ ...document, steps: document.steps.map(step => ({ ...step, flow: { next: null, branches: [] } })) }).success).toBe(false)
  })

  it('reuses task instructions across arbitrary variable host tasks without treating instruction progress as completion', () => {
    const first = reconcileGuideJourney(document, snapshot)
    expect(first).toEqual({ kind: 'tasks', stageId: 'dispatch', stepId: 'work', taskId: 'pack-1' })
    expect(reconcileGuideJourney(document, snapshot, first)).toEqual(first)
    const dispatch = snapshot.stages[2]!
    if (dispatch.kind !== 'tasks') throw new Error('Expected tasks')
    const next = { ...snapshot, stages: snapshot.stages.map(stage => stage.id === 'dispatch' ? { ...dispatch, tasks: [{ id: 'pack-1', title: text, status: 'completed' as const }, { id: 'label-2', title: text, status: 'available' as const }, { id: 'pack-3', title: text, status: 'available' as const }] } : stage) }
    expect(reconcileGuideJourney(document, next, first)).toEqual({ kind: 'tasks', stageId: 'dispatch', stepId: 'work', taskId: 'label-2' })
    expect(snapshot.stages[2]).toEqual(dispatch)
  })

  it('waits on missing, blocked and unbound host state, and moves to outcome only after trusted completion', () => {
    expect(reconcileGuideJourney(document, { ...snapshot, binding: null })).toBeNull()
    expect(reconcileGuideJourney(document, { ...snapshot, stages: [] })).toBeNull()
    expect(reconcileGuideJourney(document, { ...snapshot, stages: snapshot.stages.map(stage => stage.id === 'dispatch' ? { ...stage, status: 'blocked' } : stage) })).toBeNull()
    const final: GuideJourneySnapshot = { ...snapshot, stages: snapshot.stages.map(stage => stage.id === 'dispatch' ? { ...stage, status: 'completed' } : stage.id === 'receipt' ? { ...stage, status: 'available' } : stage) }
    expect(reconcileGuideJourney(document, final)).toEqual({ kind: 'once', stageId: 'receipt', stepId: 'finish' })
    expect(reconcileGuideJourney(document, { ...final, stages: final.stages.map(stage => ({ ...stage, status: 'completed' })) })).toBeNull()
  })
})

it('selects task-specific instruction templates and falls back safely for arbitrary task kinds', () => {
  const recipe: GuideDocument = { ...document, journey: { adapter: 'inventory.dispatch', stages: [
    { id: 'dispatch', kind: 'tasks', guideStepIds: ['select'], taskTemplates: [{ key: 'packing', guideStepIds: ['start', 'work'] }, { key: 'labelling', guideStepIds: ['finish'] }] }
  ] } }
  expect(GuideDocumentSchema.safeParse(recipe).success).toBe(true)
  const state: GuideJourneySnapshot = { binding: snapshot.binding, stages: [{ id: 'dispatch', title: text, status: 'available', kind: 'tasks', tasks: [{ id: 'pack', title: text, status: 'available', guideId: 'packing' }] }] }
  expect(reconcileGuideJourney(recipe, state)).toEqual({ kind: 'tasks', stageId: 'dispatch', taskId: 'pack', stepId: 'start' })
  const other: GuideJourneySnapshot = { ...state, stages: [{ id: 'dispatch', title: text, status: 'available', kind: 'tasks', tasks: [{ id: 'ship', title: text, status: 'available', guideId: 'unrecognized' }] }] }
  expect(reconcileGuideJourney(recipe, other)).toEqual({ kind: 'tasks', stageId: 'dispatch', taskId: 'ship', stepId: 'select' })
  const invalid = { ...recipe, journey: { adapter: 'inventory.dispatch', stages: [{ id: 'dispatch', kind: 'tasks', guideStepIds: ['select'], taskTemplates: [{ key: 'duplicate', guideStepIds: ['start', 'work'] }, { key: 'duplicate', guideStepIds: ['finish'] }] }] } }
  expect(GuideDocumentSchema.safeParse(invalid).success).toBe(false)
})

it('saves incomplete task templates as drafts and requires populated templates at publication', () => {
  const draft = { ...document, journey: { adapter: 'inventory.dispatch', stages: [{ id: 'dispatch', kind: 'tasks', guideStepIds: ['select', 'start', 'work', 'finish'], taskTemplates: [{ key: 'packing', guideStepIds: [] }] }] } }
  expect(GuideDraftSchema.safeParse(draft).success).toBe(true)
  expect(GuideDocumentSchema.safeParse(draft).success).toBe(false)
  const complete = { ...draft, journey: { adapter: 'inventory.dispatch', stages: [{ id: 'dispatch', kind: 'tasks', guideStepIds: ['select'], taskTemplates: [{ key: 'packing', guideStepIds: ['start', 'work', 'finish'] }] }] } }
  expect(GuideDocumentSchema.safeParse(complete).success).toBe(true)
})
