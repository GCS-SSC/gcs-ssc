// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { GuideDocument } from '../../src/contracts'
import type { GuideJourneySnapshot } from '../../src/journey'
import type { GuideObservedContext } from '../../src/runtime'
import GuidedHelpJourney from '../../src/components/GuidedHelpJourney.vue'
import { createGuideActionChannel } from '../../src/runtime'
import { ordinaryContext } from './runtime-fixture'
import GuidedHelpPanel from '../../src/components/GuidedHelpPanel.vue'

const text = { en: 'Review', fr: 'Examen' }
const document: GuideDocument = { formatVersion: 1, title: text, description: text, steps: [
  { id: 'general', view: 'workflow', target: 'general', kind: 'section', title: text, instructions: text },
  { id: 'answer', view: 'review', target: 'answer', kind: 'section', title: text, instructions: text },
  { id: 'save', view: 'review', target: 'save', kind: 'button', title: text, instructions: text },
  { id: 'finish', view: 'workflow', target: 'finish', kind: 'section', title: text, instructions: text }
], journey: { adapter: 'reviews', stages: [{ id: 'reviews', kind: 'tasks', guideStepIds: ['general'], taskTemplates: [{ key: 'detailed', guideStepIds: ['save', 'answer'] }] }, { id: 'finish', kind: 'once', guideStepIds: ['finish'] }] } }
const snapshot: GuideJourneySnapshot = { binding: { resourceType: 'workflow', resourceId: '1' }, stages: [
  { id: 'reviews', kind: 'tasks', title: text, status: 'available', tasks: [{ id: 'one', title: { en: 'First review', fr: 'Premier examen' }, status: 'available', guideId: 'detailed' }, { id: 'two', title: { en: 'Second review', fr: 'Deuxième examen' }, status: 'available', guideId: 'detailed' }] },
  { id: 'finish', kind: 'once', title: { en: 'Finish', fr: 'Terminer' }, status: 'available' }
] }
const options = { global: { stubs: { GuidedHelpPanel: true } } }

describe('journey uses the standard spotlight reader', () => {
  it('preserves anchored-only appearance when projecting task instructions', () => {
    const anchored = structuredClone(document)
    anchored.steps[1]!.appearance = 'anchor-only'
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document: anchored, snapshot, locale: 'en', currentView: 'review' } })
    expect(wrapper.getComponent(GuidedHelpPanel).props('document').steps.find((step: GuideDocument['steps'][number]) => step.id === 'answer')).toMatchObject({ target: 'answer', appearance: 'anchor-only' })
    wrapper.unmount()
  })

  it('uses the loaded owner binding for native entry when its active execution is not loaded on the general screen', async () => {
    const execution = { binding: snapshot.binding!, executionId: 'attempt-1' }
    const owner: GuideObservedContext = { kind: 'owner', binding: execution.binding, execution: null, view: 'workflow', visitId: 'owner-visit', draftRevision: 0, facts: [] }
    const nativeSnapshot = structuredClone(snapshot)
    const stage = nativeSnapshot.stages[0]
    if (stage?.kind === 'tasks' && stage.tasks[0]) stage.tasks[0].entryTargets = [{ kind: 'unique', key: 'risk' }]
    window.document.body.innerHTML = '<main><button data-help-target="risk">Risk Rating</button></main><a data-help-target="return">Back to records</a>'
    window.document.querySelector('main')!.dataset.helpContext = JSON.stringify(owner)
    const wrapper = mount(GuidedHelpJourney, { attachTo: window.document.body, props: { document, snapshot: { ...nativeSnapshot, execution }, locale: 'en', currentView: 'workflow', observedContext: owner, returnTarget: { kind: 'unique', key: 'return' } } })
    expect(window.document.querySelector('[data-help-target].driver-active-element')?.textContent).toBe('Risk Rating')
    expect(window.document.querySelector('.driver-popover-title')?.textContent).toBe('Review')
    await wrapper.setProps({ observedContext: { ...owner, execution: { ...execution, executionId: 'old-attempt' } } })
    expect(window.document.querySelector('.driver-popover-title')?.textContent).toBe('Return to expected task')
    expect(window.document.querySelector('[data-help-target].driver-active-element')?.textContent).toBe('Back to records')
    await wrapper.setProps({ observedContext: { ...owner, binding: { ...execution.binding, resourceId: 'other' } } })
    expect(window.document.querySelector('.driver-popover-title')?.textContent).toBe('Return to expected task')
    wrapper.unmount()
    window.document.body.innerHTML = ''
  })
  it('preserves the task template and instruction during loading, reorder and authoritative absence', async () => {
    const execution = { binding: snapshot.binding!, executionId: 'attempt-1' }
    const initial = { ...snapshot, execution }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot: initial, locale: 'en', currentView: 'review', initialCursor: { kind: 'tasks', stageId: 'reviews', taskId: 'one', stepId: 'answer' }, initialExecutionId: execution.executionId } })
    const panel = wrapper.getComponent(GuidedHelpPanel)
    await wrapper.setProps({ freshness: 'loading', snapshot: { binding: snapshot.binding, execution: null, stages: [] } })
    expect(wrapper.getComponent(GuidedHelpPanel).vm).toBe(panel.vm)
    expect(panel.props('initialStepId')).toBe('answer')
    expect(panel.props('suspended')).toBe(true)
    const reordered = structuredClone(initial)
    const stage = reordered.stages[0]
    if (stage?.kind === 'tasks') stage.tasks.reverse()
    await wrapper.setProps({ freshness: 'ready', snapshot: reordered })
    expect(wrapper.getComponent(GuidedHelpPanel).vm).toBe(panel.vm)
    expect(panel.props('context')).toContain('First review')
    if (stage?.kind === 'tasks') stage.tasks = stage.tasks.filter(task => task.id !== 'one')
    await wrapper.setProps({ snapshot: structuredClone(reordered) })
    expect(panel.props('document').steps.map((step: { id: string }) => step.id)).toEqual(['save', 'answer'])
    expect(panel.props('initialStepId')).toBe('answer')
    expect(panel.props('finishDisabled')).toBe(true)
    wrapper.unmount()
  })

  it('keeps restored task identity until the first authorized snapshot and resets a changed execution', async () => {
    const execution = { binding: snapshot.binding!, executionId: 'attempt-1' }
    const cursor = { kind: 'tasks' as const, stageId: 'reviews', taskId: 'two', stepId: 'answer' }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot: { binding: snapshot.binding, stages: [] }, freshness: 'loading', locale: 'en', currentView: 'review', initialCursor: cursor, initialExecutionId: execution.executionId } })
    await wrapper.setProps({ freshness: 'ready', snapshot: { ...snapshot, execution } })
    expect(wrapper.getComponent(GuidedHelpPanel).props('context')).toContain('Second review')
    expect(wrapper.getComponent(GuidedHelpPanel).props('initialStepId')).toBe('answer')
    await wrapper.setProps({ snapshot: { ...snapshot, execution: { ...execution, executionId: 'attempt-2' } } })
    expect(wrapper.getComponent(GuidedHelpPanel).props('context')).toContain('First review')
    expect(wrapper.getComponent(GuidedHelpPanel).props('initialStepId')).toBe('save')
    wrapper.unmount()
  })

  it('shows exact sibling recovery without changing the pinned task and distinguishes a completed previous task', async () => {
    const execution = { binding: snapshot.binding!, executionId: 'attempt-1' }
    const observed: GuideObservedContext = { kind: 'task', execution, taskId: 'two', view: 'review', visitId: 'visit', draftRevision: 0, facts: [] }
    const returnTarget = { kind: 'unique' as const, key: 'return' }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot: { ...snapshot, execution }, locale: 'en', currentView: 'review', observedContext: observed, returnTarget } })
    const panel = wrapper.getComponent(GuidedHelpPanel)
    expect(panel.props('presentation').title.en).toBe('Return to expected task')
    expect(panel.props('presentation').instructions.en).toContain('First review')
    expect(panel.props('presentation').instructions.en).toContain('Second review')
    expect(panel.props('presentation').target).toEqual(returnTarget)
    expect(panel.props('context')).toContain('First review')
    const updated = structuredClone(snapshot)
    const stage = updated.stages[0]
    if (stage?.kind === 'tasks' && stage.tasks[0]) stage.tasks[0].status = 'completed'
    await wrapper.setProps({ snapshot: { ...updated, execution }, observedContext: { ...observed, taskId: 'one' }, locale: 'fr' })
    const successor = wrapper.getComponent(GuidedHelpPanel)
    expect(successor.props('presentation').title.fr).toBe('Revenir au processus')
    expect(successor.props('presentation').instructions.fr).toContain('est terminé')
    expect(successor.props('context')).toContain('Deuxième examen')
    wrapper.unmount()
  })
  it('keeps the same popover while waiting and advances only on business completion', async () => {
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot, locale: 'en', currentView: 'review' } })
    const panel = wrapper.getComponent(GuidedHelpPanel)
    const pinnedInstructions = panel.props('document')
    await wrapper.setProps({ snapshot: structuredClone(snapshot) })
    expect(panel.props('document')).toBe(pinnedInstructions)
    expect(panel.props('document').steps.map((step: { id: string }) => step.id)).toEqual(['save', 'answer'])
    expect(panel.props('context')).toContain('First review')
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    panel.vm.$emit('select', 'answer', ['save', 'answer'])
    expect(wrapper.emitted('open')).toBeUndefined()
    panel.vm.$emit('finish')
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(GuidedHelpPanel).vm).toBe(panel.vm)
    expect(panel.props('statusMessage')).toContain('Reviewing instructions does not complete the task.')
    expect(panel.props('finishDisabled')).toBe(true)
    expect(snapshot.stages[0]?.status).toBe('available')
    expect(wrapper.emitted('exit')).toBeUndefined()
    const updated = structuredClone(snapshot)
    const stage = updated.stages[0]
    if (stage?.kind === 'tasks' && stage.tasks[0]) stage.tasks[0].status = 'completed'
    await wrapper.setProps({ snapshot: updated, locale: 'fr' })
    const nextPanel = wrapper.getComponent(GuidedHelpPanel)
    expect(nextPanel.props('context')).toContain('Deuxième examen')
    expect(nextPanel.props('initialStepId')).toBe('save')
    expect(nextPanel.props('finishDisabled')).toBe(false)
    wrapper.unmount()
  })

  it('retains cursor and preview notice through locale changes', async () => {
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot, locale: 'en', currentView: 'review', initialCursor: { kind: 'tasks', stageId: 'reviews', taskId: 'one', stepId: 'answer' }, notice: 'Preview uses real controls.' } })
    await wrapper.setProps({ locale: 'fr' })
    const panel = wrapper.getComponent(GuidedHelpPanel)
    expect(panel.props('context')).toContain('Premier examen')
    expect(panel.props('initialStepId')).toBe('answer')
    expect(panel.props('notice')).toBe('Preview uses real controls.')
    panel.vm.$emit('exit')
    expect(wrapper.emitted('exit')).toEqual([[]])
    wrapper.unmount()
  })

  it('keeps blocked and unavailable state explanations inside the familiar popover', async () => {
    const blocked = structuredClone(snapshot)
    if (blocked.stages[0]) {
      blocked.stages[0].status = 'blocked'
      blocked.stages[0].reason = { en: 'Wait for approval', fr: 'Attendez l’approbation' }
    }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot: blocked, locale: 'en', currentView: 'workflow' } })
    expect(wrapper.getComponent(GuidedHelpPanel).props('statusMessage')).toBe('Wait for approval')
    expect(wrapper.getComponent(GuidedHelpPanel).props('finishDisabled')).toBe(true)
    expect(wrapper.getComponent(GuidedHelpPanel).props('suspended')).toBe(true)
    expect(wrapper.getComponent(GuidedHelpPanel).props('actionLabel')).toBeUndefined()
    await wrapper.setProps({ snapshot: { binding: null, stages: [] }, locale: 'fr' })
    expect(wrapper.getComponent(GuidedHelpPanel).props('statusMessage')).toContain('attend')
    wrapper.unmount()
  })

  it('uses the same spotlight for generic tasks from an unrelated workflow', async () => {
    const shipment: GuideDocument = { ...document, journey: { adapter: 'shipment', stages: [{ id: 'dispatch', kind: 'tasks', guideStepIds: ['general'], taskTemplates: [{ key: 'packing', guideStepIds: ['answer'] }] }] } }
    const shippingState: GuideJourneySnapshot = { binding: { resourceType: 'shipment', resourceId: '10' }, stages: [{ id: 'dispatch', kind: 'tasks', title: text, status: 'available', tasks: [{ id: 'box', title: text, status: 'available', guideId: 'packing' }, { id: 'other', title: text, status: 'available', guideId: 'unknown' }] }] }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document: shipment, snapshot: shippingState, locale: 'en', currentView: 'review' } })
    expect(wrapper.getComponent(GuidedHelpPanel).props('document').steps[0].id).toBe('answer')
    const stage = shippingState.stages[0]
    if (stage?.kind === 'tasks' && stage.tasks[0]) stage.tasks[0].status = 'completed'
    await wrapper.setProps({ snapshot: structuredClone(shippingState) })
    expect(wrapper.getComponent(GuidedHelpPanel).props('document').steps[0].id).toBe('general')
    wrapper.unmount()
  })

  it('exits final result instructions without claiming to complete business work', async () => {
    const finalSnapshot: GuideJourneySnapshot = { ...snapshot, stages: snapshot.stages.map(stage => stage.id === 'reviews' ? { ...stage, status: 'completed' } : stage) }
    const wrapper = mount(GuidedHelpJourney, { ...options, props: { document, snapshot: finalSnapshot, locale: 'en', currentView: 'workflow' } })
    wrapper.getComponent(GuidedHelpPanel).vm.$emit('finish')
    expect(wrapper.emitted('exit')).toEqual([[]])
    expect(finalSnapshot.stages[1]?.status).toBe('available')
    wrapper.unmount()
  })
})

it('renders journey guidance through the real Driver popover and retains it during business waits', async () => {
  window.document.body.innerHTML = '<main data-help-view="workflow"><section data-help-target="general"></section></main>'
  const generic: GuideDocument = { ...document, journey: { adapter: 'other-workflow', stages: [{ id: 'reviews', kind: 'tasks', guideStepIds: ['general'] }] } }
  const wrapper = mount(GuidedHelpJourney, { attachTo: window.document.body, props: { document: generic, snapshot, locale: 'en', currentView: 'workflow' } })
  expect(window.document.querySelector('.driver-popover')).not.toBeNull()
  expect(window.document.querySelector('.gcs-guide-step-select')).not.toBeNull()
  expect(window.document.querySelector('.gcs-guide-journey')).toBeNull()
  window.document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  await wrapper.vm.$nextTick()
  expect(window.document.querySelector('.driver-popover [role="status"]')?.textContent).toContain('Reviewing instructions does not complete the task.')
  expect(wrapper.emitted('exit')).toBeUndefined()
  window.document.querySelector<HTMLButtonElement>('.driver-popover-close-btn')!.click()
  expect(wrapper.emitted('exit')).toEqual([[]])
  wrapper.unmount()
  expect(window.document.querySelector('.driver-popover')).toBeNull()
  window.document.body.innerHTML = ''
})

it('retains trusted completed action gates when the same pinned instructions change locale', async () => {
  window.document.body.innerHTML = '<button data-help-target="save">Save</button><section data-help-target="answer"></section>'
  const actionChannel = createGuideActionChannel()
  const wrapper = mount(GuidedHelpPanel, { attachTo: window.document.body, props: { actionChannel, observedContext: ordinaryContext, document: { ...document, steps: [document.steps[2]!, document.steps[1]!] }, locale: 'en', currentView: 'review' } })
  actionChannel.begin({ kind: 'succeeded', source: { target: { kind: 'unique', key: 'save' }, action: 'save-success', context: ordinaryContext } })()
  expect(wrapper.emitted('select')?.at(-1)?.[0]).toBe('answer')
  const replacement: GuideDocument = { ...document, steps: [document.steps[2]!, document.steps[1]!] }
  await wrapper.setProps({ document: structuredClone(replacement), locale: 'fr' })
  const chooser = window.document.querySelector<HTMLSelectElement>('.gcs-guide-step-select')!
  expect(chooser.value).toBe('answer')
  chooser.value = 'save'
  chooser.dispatchEvent(new Event('change'))
  expect(wrapper.emitted('select')?.at(-1)?.[0]).toBe('save')
  window.document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(window.document.querySelector<HTMLSelectElement>('.gcs-guide-step-select')!.value).toBe('answer')
  wrapper.unmount()
  window.document.body.innerHTML = ''
})
