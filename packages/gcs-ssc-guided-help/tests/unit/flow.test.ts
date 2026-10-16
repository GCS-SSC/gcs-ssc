// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GuideDocumentSchema, GuideDraftSchema, TargetLedgerSchema, checkGuideCompatibility, isGuidePath } from '../../src/contracts'
import type { GuideDocument, GuideStep } from '../../src/contracts'
import { createGuideRuntime, readGuideTargetValue } from '../../src/runtime'
import { createGuideSession } from '../../src/session'

const bilingual = (value: string) => ({ en: value, fr: value })
const node = (id: string, kind: GuideStep['kind'] = 'section'): GuideStep => ({ id, view: 'example', target: id, kind, advanceOn: 'manual', title: bilingual(id), instructions: bilingual('Instructions') })
const guide: GuideDocument = {
  formatVersion: 1, title: bilingual('Decision'), description: bilingual('Structured choices only'), steps: [
    { ...node('choice', 'select'), flow: { next: 'save', branches: [{ target: 'choice', equals: 'premium', next: 'finish' }] } },
    { ...node('save', 'button'), flow: { next: 'finish', branches: [] } },
    node('finish')
  ]
}
const ledger = { formatVersion: 1, views: [{ key: 'example', label: bilingual('Example'), targets: [
  { key: 'choice', label: bilingual('Choice'), kind: 'select', choices: [{ value: 'basic', label: bilingual('Basic') }, { value: 'premium', label: bilingual('Premium') }] },
  { key: 'save', label: bilingual('Save'), kind: 'button' }, { key: 'finish', label: bilingual('Finish'), kind: 'section' }
] }] }
const markup = '<select data-help-target="choice"><option value="">Choose</option><option value="basic">Basic</option><option value="premium">Premium</option></select><button data-help-target="save">Save</button><section data-help-target="finish">Finish</section>'
afterEach(() => {
  document.body.innerHTML = ''
})

describe('safe published flow contracts', () => {
  it('accepts typed branches and repeated destinations while preserving linear documents', () => {
    expect(GuideDocumentSchema.parse(guide)).toEqual(guide)
    expect(checkGuideCompatibility(guide, TargetLedgerSchema.parse(ledger))).toEqual([])
    const sharedDestination = { ...guide, steps: [{ ...guide.steps[0]!, flow: { next: 'save', branches: [{ target: 'choice', equals: 'basic', next: 'finish' }, { target: 'choice', equals: 'premium', next: 'finish' }] } }, ...guide.steps.slice(1)] }
    expect(GuideDocumentSchema.safeParse(sharedDestination).success).toBe(true)
  })
  it.each([
    { next: 'unknown', branches: [] }, { next: 'choice', branches: [] },
    { next: 'save', branches: [{ target: 'choice', equals: 'basic', next: 'save' }, { target: 'choice', equals: 'basic', next: 'finish' }] },
    { next: 'save', branches: [{ target: 'choice', equals: 'basic', next: 'choice' }] },
    { next: 'save', branches: [{ target: '#selector', equals: 'basic', next: 'finish' }] }
  ])('rejects dangling, backward and duplicate conditions at publication: %j', flow => {
    const draft = { ...guide, steps: [{ ...guide.steps[0], flow }, ...guide.steps.slice(1)] }
    expect(GuideDraftSchema.safeParse(draft).success).toBe(true)
    expect(GuideDocumentSchema.safeParse(draft).success).toBe(false)
  })
  it.each([
    { target: 'choice', equals: 'unregistered', next: 'finish' },
    { target: 'choice', equals: true, next: 'finish' },
    { target: 'save', equals: true, next: 'finish' },
    { target: 'other-view', equals: 'premium', next: 'finish' }
  ])('rejects unsupported condition targets/types/choices through the independent ledger: %j', branch => {
    const documentGuide = GuideDocumentSchema.parse({ ...guide, steps: [{ ...guide.steps[0], flow: { next: 'save', branches: [branch] } }, ...guide.steps.slice(1)] })
    expect(checkGuideCompatibility(documentGuide, TargetLedgerSchema.parse(ledger))).toMatchObject([{ code: 'invalid-condition' }])
  })
  it('rejects duplicate or non-select choice catalogs and executable branch configuration', () => {
    const targets = ledger.views[0]!.targets
    expect(TargetLedgerSchema.safeParse({ ...ledger, views: [{ ...ledger.views[0], targets: [{ ...targets[0], choices: [targets[0]!.choices![0], targets[0]!.choices![0]] }] }] }).success).toBe(false)
    expect(TargetLedgerSchema.safeParse({ ...ledger, views: [{ ...ledger.views[0], targets: [{ ...targets[0], kind: 'text' }] }] }).success).toBe(false)
    expect(GuideDraftSchema.safeParse({ ...guide, steps: [{ ...guide.steps[0], flow: { next: null, branches: [], evaluate: 'alert(1)' } }] }).success).toBe(false)
  })
})

describe('evaluated reader paths', () => {
  it('takes the chosen path, ignores unvisited action gates and returns through actual history', () => {
    document.body.innerHTML = markup
    const select = document.querySelector<HTMLSelectElement>('[data-help-target="choice"]')!
    select.value = 'premium'
    const onSelect = vi.fn()
    const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'example', onSelect })
    runtime.select('save')
    expect(runtime.state.value.step.id).toBe('choice')
    expect(document.querySelector<HTMLOptionElement>('.gcs-guide-step-select option[value="save"]')!.disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
    expect(runtime.path).toEqual(['choice', 'finish'])
    expect(onSelect).toHaveBeenCalledWith('finish', ['choice', 'finish'])
    document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!.click()
    expect(runtime.state.value.step.id).toBe('choice')
    select.value = 'basic'
    runtime.select('finish')
    expect(runtime.state.value.step.id).toBe('choice')
    runtime.select('save')
    expect(runtime.path).toEqual(['choice', 'save'])
    runtime.select('finish')
    expect(runtime.state.value.step.id).toBe('save')
    window.dispatchEvent(new CustomEvent('guided-help:completed', { detail: { target: 'save', action: 'save-success' } }))
    runtime.select('finish')
    expect(runtime.path).toEqual(['choice', 'save', 'finish'])
    runtime.destroy()
  })
  it('blocks missing or hidden conditions, distinguishes unselected fallback, and honors explicit terminal branches', () => {
    const conditional: GuideDocument = { ...guide, steps: [{ ...guide.steps[0]!, target: 'intro', kind: 'section', flow: { next: 'save', branches: [{ target: 'choice', equals: 'premium', next: null }] } }, ...guide.steps.slice(1)] }
    document.body.innerHTML = '<section data-help-target="intro">Intro</section>'
    const onExit = vi.fn()
    const runtime = createGuideRuntime({ document: conditional, locale: 'fr', currentView: 'example', onExit })
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
    expect(document.querySelector('.gcs-guide-status')?.textContent).toContain('décision')
    expect(document.querySelector('.gcs-guide-retry')).not.toBeNull()
    document.body.insertAdjacentHTML('beforeend', markup)
    const select = document.querySelector<HTMLSelectElement>('[data-help-target="choice"]')!
    select.hidden = true
    runtime.retry()
    runtime.select('save')
    expect(runtime.state.value.step.id).toBe('choice')
    select.hidden = false
    runtime.retry()
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(false)
    select.value = 'premium'
    runtime.retry()
    document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
    expect(onExit).toHaveBeenCalledOnce()
  })
  it('advances a native structured choice on change and supports explicit trusted composite completion', () => {
    document.body.innerHTML = markup
    const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[0]!, advanceOn: 'completion' }, ...guide.steps.slice(1)] }, locale: 'en', currentView: 'example' })
    const select = document.querySelector<HTMLSelectElement>('[data-help-target="choice"]')!
    select.value = 'premium'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(runtime.state.value.step.id).toBe('finish')
    runtime.destroy()
    document.body.innerHTML = '<button role="switch" aria-checked="false" data-help-target="choice">Enabled</button><section data-help-target="finish"></section>'
    let checked = false
    const booleanGuide: GuideDocument = { ...guide, steps: [{ ...node('choice', 'checkbox'), advanceOn: 'completion', flow: { next: null, branches: [{ target: 'choice', equals: true, next: 'finish' }] } }, node('finish')] }
    const composite = createGuideRuntime({ document: booleanGuide, locale: 'en', currentView: 'example', readTargetValue: () => checked })
    checked = true
    window.dispatchEvent(new CustomEvent('guided-help:completed', { detail: { target: 'choice', action: 'field-change' } }))
    expect(composite.state.value.step.id).toBe('finish')
    composite.destroy()
  })
  it('restores a validated actual path and does not infer unvisited branches from array position', () => {
    document.body.innerHTML = markup
    const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'example', initialStepId: 'finish', initialPath: ['choice', 'finish'] })
    expect(runtime.state.value.step.id).toBe('finish')
    expect(runtime.path).toEqual(['choice', 'finish'])
    document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!.click()
    expect(runtime.state.value.step.id).toBe('choice')
    runtime.destroy()
  })
})

it('reads only typed native and accessible boolean values, with unavailable distinct from empty', () => {
  document.body.innerHTML = markup
  expect(readGuideTargetValue(document, 'choice')).toBeNull()
  expect(readGuideTargetValue(document, 'missing')).toBeUndefined()
  document.body.innerHTML = '<input type="checkbox" data-help-target="enabled"><button role="switch" aria-checked="true" data-help-target="switch"></button>'
  const checkbox = document.querySelector('input')!
  expect(readGuideTargetValue(document, 'enabled')).toBe(false)
  checkbox.indeterminate = true
  expect(readGuideTargetValue(document, 'enabled')).toBeUndefined()
  expect(readGuideTargetValue(document, 'switch')).toBe(true)
  document.querySelector('button')!.setAttribute('aria-checked', 'mixed')
  expect(readGuideTargetValue(document, 'switch')).toBeUndefined()
})

it('stores only validated step paths in tab progress and rejects forged transitions', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) }
  }
  const session = createGuideSession(storage)
  session.launch({ userId: 'u', agencyId: 'a', publicationId: 'p', versionId: 'v', document: guide })
  expect(session.select('u', 'finish', ['choice', 'finish'])?.path).toEqual(['choice', 'finish'])
  expect(session.restore('u')?.path).toEqual(['choice', 'finish'])
  expect(session.select('u', 'finish', ['choice', 'finish', 'save', 'finish'])).toBeNull()
  expect(isGuidePath(guide, ['choice', 'save', 'finish'], 'finish')).toBe(true)
  expect(isGuidePath(guide, ['save', 'finish'], 'finish')).toBe(false)
  const key = [...values.keys()][0]!
  values.set(key, JSON.stringify({ ...session.restore('u'), path: ['choice', 'finish', 'save'] }))
  expect(session.restore('u')).toBeNull()
})

it('branches on a native boolean change, accepts false, and waits for all conditions to be available', () => {
  document.body.innerHTML = '<input type="checkbox" data-help-target="enabled"><section data-help-target="finish"></section>'
  const booleanGuide: GuideDocument = { ...guide, steps: [{ ...node('enabled', 'checkbox'), advanceOn: 'completion', flow: { next: null, branches: [{ target: 'enabled', equals: false, next: 'finish' }] } }, node('finish')] }
  const runtime = createGuideRuntime({ document: booleanGuide, locale: 'en', currentView: 'example' })
  const control = document.querySelector('input')!
  control.checked = false
  control.dispatchEvent(new Event('change', { bubbles: true }))
  expect(runtime.path).toEqual(['enabled', 'finish'])
  runtime.destroy()
  document.body.innerHTML = markup
  document.querySelector<HTMLSelectElement>('[data-help-target="choice"]')!.value = 'premium'
  const multipleConditions: GuideDocument = { ...guide, steps: [{ ...guide.steps[0]!, flow: { next: 'save', branches: [{ target: 'choice', equals: 'premium', next: 'finish' }, { target: 'missing', equals: true, next: 'finish' }] } }, ...guide.steps.slice(1)] }
  const missing = createGuideRuntime({ document: multipleConditions, locale: 'en', currentView: 'example' })
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  missing.select('finish')
  expect(missing.state.value.step.id).toBe('choice')
  missing.destroy()
})

it('waits for trusted composite completion after a switch proxy changes before its accessible value settles', () => {
  document.body.innerHTML = '<button role="switch" aria-checked="true" data-help-target="enabled"><input type="checkbox" aria-hidden="true" checked></button><section data-help-target="active"></section><section data-help-target="inactive"></section>'
  const documentGuide: GuideDocument = { ...guide, steps: [{ ...node('enabled', 'checkbox'), advanceOn: 'completion', flow: { next: 'inactive', branches: [{ target: 'enabled', equals: true, next: 'active' }] } }, { ...node('active'), flow: { next: null, branches: [] } }, node('inactive')] }
  const onSelect = vi.fn()
  const runtime = createGuideRuntime({ document: documentGuide, locale: 'en', currentView: 'example', onSelect })
  const proxy = document.querySelector('input')!
  proxy.checked = false
  proxy.dispatchEvent(new Event('change', { bubbles: true }))
  expect(runtime.state.value.step.id).toBe('enabled')
  expect(onSelect).not.toHaveBeenCalled()
  document.querySelector('[role="switch"]')!.setAttribute('aria-checked', 'false')
  window.dispatchEvent(new CustomEvent('guided-help:completed', { detail: { target: 'enabled', action: 'field-change' } }))
  window.dispatchEvent(new CustomEvent('guided-help:completed', { detail: { target: 'enabled', action: 'field-change' } }))
  expect(runtime.path).toEqual(['enabled', 'inactive'])
  expect(onSelect).toHaveBeenCalledOnce()
  runtime.destroy()
})

it('keeps the next business switch visible within a scrollable modal after automatic branching', () => {
  document.body.innerHTML = '<div role="dialog" data-state="open"><button role="switch" aria-checked="false" data-help-target="enabled">Active</button></div>'
  const control = document.querySelector<HTMLElement>('[role="switch"]')!
  const scroll = vi.fn()
  control.scrollIntoView = scroll
  const documentGuide: GuideDocument = { ...guide, steps: [{ ...node('enabled', 'checkbox'), advanceOn: 'completion', flow: { next: 'details', branches: [] } }, { ...node('details', 'checkbox'), target: 'enabled' }] }
  const runtime = createGuideRuntime({ document: documentGuide, locale: 'en', currentView: 'example' })
  window.dispatchEvent(new CustomEvent('guided-help:completed', { detail: { target: 'enabled', action: 'field-change' } }))
  expect(runtime.state.value.step.id).toBe('details')
  expect(document.activeElement).toBe(control)
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  scroll.mockClear()
  runtime.retry()
  expect(document.activeElement).toBe(control)
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  runtime.destroy()
})
