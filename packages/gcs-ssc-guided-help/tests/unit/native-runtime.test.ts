// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createGuideActionChannel, createGuideRuntime, GuideObservedContextSchema } from '../../src/runtime'
import type { GuideActionChannel, GuideActionSource, GuideObservedContext } from '../../src/runtime'
import type { GuideDocument, GuideStep, TargetLedger } from '../../src/contracts'

const bilingual = (value: string) => ({ en: value, fr: value })
const execution = { binding: { resourceType: 'shipment', resourceId: '12' }, executionId: 'attempt-4' }
const context: GuideObservedContext = { kind: 'task', execution, taskId: 'packing:1', visitId: 'visit-1', draftRevision: 0, view: 'packing', facts: [] }
const step = (id: string, kind: GuideStep['kind'] = 'section'): GuideStep => ({ id, view: 'packing', target: id, kind, title: bilingual(id), instructions: bilingual(`Instructions for ${id}`) })
const guide = (steps: GuideStep[]): GuideDocument => ({ formatVersion: 1, title: bilingual('Packing'), description: bilingual('Shipment'), steps })
const catalog = (steps: GuideStep[]): TargetLedger => ({ formatVersion: 1, views: [{ key: 'packing', label: bilingual('Packing'), targets: steps.map(item => ({ key: item.target, label: item.title, kind: item.kind, ...(item.kind === 'button' ? { completion: { kind: 'success' as const, action: 'save-success' as const } } : {}) })) }] })
const source = (key: string, overrides: Partial<GuideActionSource> = {}): GuideActionSource => ({ target: { kind: 'unique', key }, action: 'save-success', context, ...overrides })
const success = (channel: GuideActionChannel, action: GuideActionSource) => channel.begin({ kind: 'succeeded', source: action })()
const next = () => document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
let active: ReturnType<typeof createGuideRuntime> | null = null
afterEach(() => {
  active?.destroy()
  active = null
  document.body.innerHTML = ''
})

describe('reader operation lease', () => {
  it('captures reactive source, supersedes older drafts, publishes once and rejects released tickets', () => {
    const channel = createGuideActionChannel()
    const receive = vi.fn()
    channel.begin({ kind: 'succeeded', source: source('save') })()
    const release = channel.attach(receive)!
    expect(channel.attach(receive)).toBeNull()
    const first = channel.begin(reactive({ kind: 'succeeded', source: source('save') }))
    const newer = channel.begin({ kind: 'succeeded', source: source('save', { context: { ...context, draftRevision: 1 } }) })
    first()
    newer()
    newer()
    expect(receive).toHaveBeenCalledTimes(1)
    const stale = channel.begin({ kind: 'succeeded', source: source('save') })
    release()
    channel.attach(receive)
    stale()
    expect(receive).toHaveBeenCalledTimes(1)
  })

  it('keeps distinct target tickets independent and forwards trusted record signals through the reader', () => {
    const channel = createGuideActionChannel()
    const onSignal = vi.fn()
    active = createGuideRuntime({ document: guide([step('answer')]), locale: 'en', currentView: 'packing', actionChannel: channel, observedContext: context, onSignal })
    channel.begin({ kind: 'selected', binding: execution.binding })()
    channel.begin({ kind: 'invalidated', binding: execution.binding })()
    expect(onSignal.mock.calls.map(call => call[0].kind)).toEqual(['selected', 'invalidated'])
    const first = channel.begin({ kind: 'succeeded', source: source('save-a') })
    channel.begin({ kind: 'succeeded', source: source('save-b') })()
    first()
    expect(onSignal).toHaveBeenCalledTimes(2)
  })
})

describe('authoritative instruction completion', () => {
  it('never exposes Driver placeholder copy while the authorized context is loading', () => {
    active = createGuideRuntime({ document: guide([step('answer')]), locale: 'en', currentView: 'packing', observedContext: { kind: 'pending' }, suspended: true, statusMessage: 'Loading the current record' })
    expect(document.querySelector('.driver-popover-description')?.textContent).toBe('Loading the current record')
    expect(document.body.textContent).not.toContain('Popover description is here')
  })

  it('focuses the native action when automatic progression reaches an asynchronously rendered section', async () => {
    document.body.innerHTML = '<section data-help-target="arrive"></section>'
    const steps = [step('arrive'), { ...step('work'), advanceOn: 'manual' as const }]
    const ledger = catalog(steps)
    ledger.views[0]!.targets[0]!.completion = { kind: 'location', fact: 'task.arrived' }
    active = createGuideRuntime({ document: guide(steps), ledger, locale: 'en', currentView: 'packing', observedContext: { ...context, facts: ['task.arrived'] } })
    expect(active.state.value.step.id).toBe('work')
    const section = document.createElement('section')
    section.dataset.helpTarget = 'work'
    section.innerHTML = '<button data-help-target="finish" data-help-kind="button">Complete work</button>'
    document.body.append(section)
    await vi.waitFor(() => expect(document.activeElement).toBe(section.querySelector('button')))
  })

  it('sizes nonmodal guidance after scrolling its native target into the resized viewport', () => {
    document.body.innerHTML = '<button data-help-target="complete">Complete work</button>'
    const target = document.querySelector('button')!
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    let bounds = new DOMRect(312, 919.7, 222.8, 32)
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => bounds)
    target.scrollIntoView = vi.fn(() => {
      bounds = new DOMRect(56, 405.7, 222.8, 32)
    })
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })
      active = createGuideRuntime({ document: guide([{ ...step('complete', 'button'), advanceOn: 'manual' }]), locale: 'fr', currentView: 'packing', observedContext: context })
      bounds = new DOMRect(56, 919.7, 222.8, 32)
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
      window.dispatchEvent(new Event('resize'))
      expect(target.scrollIntoView).toHaveBeenCalled()
      expect(Number.parseFloat(document.querySelector<HTMLElement>('.driver-popover')!.style.maxHeight)).toBeCloseTo(374.3)
      expect(target.classList.contains('driver-active-element')).toBe(true)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height })
    }
  })

  it('releases its reader and all listeners when the initial terminal location is already satisfied', () => {
    document.body.innerHTML = '<button data-help-target="arrive">Open packing</button>'
    const steps = [step('arrive', 'button')]
    const ledger = catalog(steps)
    ledger.views[0]!.targets[0]!.completion = { kind: 'location', fact: 'task.arrived' }
    const channel = createGuideActionChannel()
    const onExit = vi.fn()
    const windowAdds = vi.spyOn(window, 'addEventListener')
    const windowRemoves = vi.spyOn(window, 'removeEventListener')
    const documentAdds = vi.spyOn(document, 'addEventListener')
    const documentRemoves = vi.spyOn(document, 'removeEventListener')
    try {
      active = createGuideRuntime({ document: guide(steps), ledger, locale: 'en', currentView: 'packing', observedContext: { ...context, facts: ['task.arrived'] }, actionChannel: channel, onExit })
      expect(onExit).toHaveBeenCalledOnce()
      expect(document.querySelector('.driver-popover')).toBeNull()
      const release = channel.attach(() => {})
      expect(release).not.toBeNull()
      release?.()
      for (const tracked of [{ adds: windowAdds, removes: windowRemoves }, { adds: documentAdds, removes: documentRemoves }]) {
        tracked.adds.mock.calls.forEach(([type, listener], index) => {
          if (!['keydown', 'input', 'change', 'focusout', 'focusin', 'resize', 'scroll'].includes(type)) return
          expect(tracked.removes.mock.calls.some(([removedType, removedListener], removeIndex) => removedType === type && removedListener === listener
            && tracked.removes.mock.invocationCallOrder[removeIndex]! > tracked.adds.mock.invocationCallOrder[index]!)).toBe(true)
        })
      }
    } finally {
      windowAdds.mockRestore()
      windowRemoves.mockRestore()
      documentAdds.mockRestore()
      documentRemoves.mockRestore()
    }
  })

  it('persists the actual caught-up step after restoring through a satisfied navigation gate', () => {
    document.body.innerHTML = '<button data-help-target="arrive">Open packing</button><section data-help-target="read"></section><section data-help-target="end"></section>'
    const steps = [step('arrive', 'button'), { ...step('read'), advanceOn: 'manual' as const }, step('end')]
    const ledger = catalog(steps)
    ledger.views[0]!.targets[0]!.completion = { kind: 'location', fact: 'task.arrived' }
    const onSelect = vi.fn()
    active = createGuideRuntime({ document: guide(steps), ledger, locale: 'en', currentView: 'packing', observedContext: { ...context, facts: ['task.arrived'] }, initialStepId: 'end', onSelect })
    expect(active.state.value.step.id).toBe('read')
    expect(onSelect).toHaveBeenLastCalledWith('read', ['arrive', 'read'])
  })

  it('remembers an early Save for this exact target and stops at another Save target', async () => {
    document.body.innerHTML = '<section data-help-target="answer"></section><button data-help-target="save-a"></button><button data-help-target="save-b"></button><section data-help-target="end"></section>'
    const steps = [{ ...step('answer'), advanceOn: 'manual' as const }, step('save-a', 'button'), step('save-b', 'button'), step('end')]
    const channel = createGuideActionChannel()
    active = createGuideRuntime({ document: guide(steps), ledger: catalog(steps), locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel })
    success(channel, source('save-a'))
    expect(active.state.value.step.id).toBe('answer')
    next()
    await Promise.resolve()
    expect(active.state.value.step.id).toBe('save-b')
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
    success(channel, source('save-b'))
    expect(active.state.value.step.id).toBe('end')
    active.updateContext({ currentView: 'packing', locale: 'en', observedContext: { ...context, draftRevision: 1 } })
    expect(active.state.value.step.id).toBe('save-a')
  })

  it('retains a captured successful Save through loading, rejects sibling/visit/attempt receipts and restores without replay', () => {
    document.body.innerHTML = '<button data-help-target="save"></button><section data-help-target="end"></section>'
    const steps = [step('save', 'button'), step('end')]
    const channel = createGuideActionChannel()
    active = createGuideRuntime({ document: guide(steps), ledger: catalog(steps), locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel })
    for (const foreign of [{ ...context, taskId: 'packing:2' }, { ...context, visitId: 'old-visit' }, { ...context, execution: { ...execution, executionId: 'old-attempt' } }]) success(channel, source('save', { context: foreign }))
    expect(active.state.value.step.id).toBe('save')
    const saved = channel.begin({ kind: 'succeeded', source: source('save') })
    active.updateContext({ currentView: 'packing', locale: 'en', observedContext: { kind: 'pending' }, suspended: true })
    saved()
    expect(active.state.value.step.id).toBe('save')
    active.updateContext({ currentView: 'packing', locale: 'fr', observedContext: context, suspended: false })
    expect(active.state.value.step.id).toBe('end')
    active.destroy()
    active = createGuideRuntime({ document: guide(steps), ledger: catalog(steps), initialStepId: 'end', initialPath: ['save', 'end'], locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel })
    expect(active.state.value.step.id).toBe('save')
  })

  it('catches up loaded navigation facts and preserves explicit manual instructions', () => {
    const steps = [step('arrive', 'navigation'), { ...step('read'), advanceOn: 'manual' as const }, step('section', 'navigation'), step('end')]
    const ledger = catalog(steps)
    ledger.views[0]!.targets[0]!.completion = { kind: 'location', fact: 'task.arrived' }
    ledger.views[0]!.targets[2]!.completion = { kind: 'location', fact: 'section.selected' }
    active = createGuideRuntime({ document: guide(steps), ledger, locale: 'en', currentView: 'packing', observedContext: { ...context, facts: ['task.arrived', 'section.selected'] } })
    expect(active.state.value.step.id).toBe('read')
    next()
    return vi.waitFor(() => expect(active!.state.value.step.id).toBe('end'))
  })

  it('does not rewind into an unvisited branch action and exits a standalone final Save', () => {
    document.body.innerHTML = '<select data-help-target="choice"><option value="skip">Skip</option></select><section data-help-target="choice"></section><button data-help-target="save"></button>'
    const choice = { ...step('choice'), advanceOn: 'manual' as const, flow: { next: 'save', branches: [{ target: 'choice', equals: 'skip', next: 'end' }] } }
    document.querySelector('section')!.remove()
    const steps = [choice, step('save', 'button'), step('end')]
    active = createGuideRuntime({ document: guide(steps), ledger: catalog(steps), locale: 'en', currentView: 'packing', observedContext: context })
    next()
    active.updateContext({ currentView: 'packing', locale: 'fr', observedContext: context })
    expect(active.state.value.step.id).toBe('end')
    active.destroy()
    const channel = createGuideActionChannel()
    const onExit = vi.fn()
    active = createGuideRuntime({ document: guide([step('save', 'button')]), ledger: catalog([step('save', 'button')]), locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel, onExit })
    success(channel, source('save'))
    expect(onExit).toHaveBeenCalledOnce()
    expect(document.querySelector('.driver-popover')).toBeNull()
  })

  it('keeps modal-open evidence through editing and requires opening again after Cancel', async () => {
    document.body.innerHTML = '<button data-help-target="add">Add</button><div role="dialog" data-state="open"><input data-help-target="field"><button data-help-target="save">Save</button></div>'
    const steps = [step('add', 'button'), { ...step('field', 'text'), advanceOn: 'manual' as const }, step('save', 'button')]
    const ledger = catalog(steps)
    ledger.views[0]!.targets[0]!.completion = { kind: 'success', action: 'modal-open' }
    const channel = createGuideActionChannel()
    active = createGuideRuntime({ document: guide(steps), ledger, locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel })
    success(channel, source('add', { action: 'modal-open' }))
    active.updateContext({ currentView: 'packing', locale: 'en', observedContext: { ...context, draftRevision: 1 } })
    expect(active.state.value.step.id).toBe('field')
    document.querySelector('[role="dialog"]')!.remove()
    await vi.waitFor(() => expect(active!.state.value.step.id).toBe('add'))
    await Promise.resolve()
    expect(active.state.value.step.id).toBe('add')
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  })
})

describe('exact native target resolution', () => {
  it('anchors without a spotlight and keeps native Tab behavior, then restores spotlight on the next step', async () => {
    document.body.innerHTML = '<main><h2 data-help-target="answer">All questions</h2><textarea></textarea><button data-help-target="save">Save</button></main>'
    const target = document.querySelector('h2')!
    const draft = document.querySelector('textarea')!
    const steps = [{ ...step('answer'), appearance: 'anchor-only' as const, advanceOn: 'manual' as const }, step('save', 'button')]
    active = createGuideRuntime({ document: guide(steps), locale: 'en', currentView: 'packing', observedContext: context })
    await vi.waitFor(() => expect(document.querySelector<SVGElement>('.driver-overlay')?.style.display).toBe('none'))
    expect(target.classList.contains('driver-active-element')).toBe(false)
    expect(document.querySelector('.driver-popover')?.classList.contains('gcs-guide-anchor-only')).toBe(true)
    expect(document.querySelector('.gcs-guide-spotlight-border')).toBeNull()
    draft.focus()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    draft.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(draft)
    expect(document.querySelector('.driver-popover')).not.toBeNull()
    next()
    expect(document.querySelector('.driver-popover')?.classList.contains('gcs-guide-anchor-only')).toBe(false)
    expect(target.getAttribute('aria-haspopup')).toBeNull()
    expect(target.getAttribute('aria-expanded')).toBeNull()
    expect(target.getAttribute('aria-controls')).toBeNull()
    await vi.waitFor(() => expect(document.querySelector<SVGElement>('.driver-overlay')?.style.display).toBe(''))
    expect(document.querySelector('[data-help-target="save"]')?.classList.contains('driver-active-element')).toBe(true)
    const trapped = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(trapped)
    expect(trapped.defaultPrevented).toBe(true)
  })

  it.each(['input', 'textarea'].flatMap(control => ['spotlight', 'anchor-only'].flatMap(appearance => ['inside', 'outside'].map(placement => ({ control, appearance, placement })))))('keeps $control focus and selection $placement the $appearance anchor during draft updates', ({ control, appearance, placement }) => {
    document.body.innerHTML = placement === 'inside' ? `<main><section data-help-target="answer"><${control}></${control}></section></main>` : `<main><h2 data-help-target="answer">All questions</h2><${control}></${control}></main>`
    const draft = document.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea')!
    active = createGuideRuntime({ document: guide([{ ...step('answer'), appearance: appearance === 'anchor-only' ? 'anchor-only' : 'spotlight', advanceOn: 'manual' }]), locale: 'en', currentView: 'packing', observedContext: context })
    const visible = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(80)
    const heading = document.querySelector<HTMLElement>('[data-help-target="answer"]')!
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(24, -800, 900, 40))
    heading.scrollIntoView = vi.fn()
    const popover = document.querySelector('.driver-popover')
    try {
      draft.focus()
      for (const [index, character] of [...'Evidence'].entries()) {
        draft.value += character
        draft.dispatchEvent(new Event('input', { bubbles: true }))
        active.updateContext({ currentView: 'packing', locale: 'en', observedContext: { ...context, draftRevision: index + 1 } })
        expect(document.activeElement).toBe(draft)
        expect(document.querySelector('.driver-popover')).toBe(popover)
      }
      draft.setSelectionRange(2, 4)
      active.updateContext({ currentView: 'packing', locale: 'en', observedContext: { ...context, draftRevision: 9 } })
      expect(draft.selectionStart).toBe(2)
      expect(draft.selectionEnd).toBe(4)
      expect(heading.scrollIntoView).not.toHaveBeenCalled()
      expect(draft.value).toBe('Evidence')
      expect(active.state.value.step.id).toBe('answer')
    } finally { visible.mockRestore() }
  })

  it('outlines only the padded native spotlight opening and follows native path refreshes', async () => {
    document.body.innerHTML = '<input data-help-target="answer" value="Evidence">'
    const target = document.querySelector('input')!
    let bounds = new DOMRect(100, 200, 240, 40)
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => bounds)
    active = createGuideRuntime({ document: guide([{ ...step('answer', 'text'), advanceOn: 'manual' }]), locale: 'en', currentView: 'packing', observedContext: context })
    await vi.waitFor(() => expect(document.querySelector('.gcs-guide-spotlight-border')).not.toBeNull())
    const native = document.querySelector('.driver-overlay path:not(.gcs-guide-spotlight-border)')!
    const border = document.querySelector('.gcs-guide-spotlight-border')!
    expect(border.getAttribute('d')).toBe(native.getAttribute('d')!.split('Z')[1]!.trim())
    expect(border.getAttribute('d')).toContain('M95,190')
    expect(border.getAttribute('d')).not.toContain('M1024,0')
    expect(target.getAttribute('style')).toBeNull()
    expect(border.getAttribute('aria-hidden')).toBe('true')
    bounds = new DOMRect(100, 140, 240, 40)
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(border.getAttribute('d')).toContain('M95,130'))
    expect(document.querySelector('.gcs-guide-spotlight-border')).toBe(border)
    active.destroy()
    expect(document.querySelector('.gcs-guide-spotlight-border')).toBeNull()
  })

  it.each(['spotlight', 'anchor-only'].flatMap(appearance => ['nested', 'window'].map(scroll => ({ appearance, scroll }))))('tracks scrolling in $appearance mode on $scroll without rebuilding or moving focus', async ({ appearance, scroll }) => {
    document.body.innerHTML = '<main id="scroller"><button data-help-target="open" data-help-instance="packing:1">Sibling</button><textarea>Unsaved evidence</textarea><button data-help-target="open" data-help-instance="packing:2">Open review</button></main>'
    const owner: GuideObservedContext = { kind: 'owner', binding: execution.binding, execution, view: 'packing', visitId: 'owner-visit', draftRevision: 0, facts: [] }
    const scroller = document.getElementById('scroller')!
    scroller.dataset.helpContext = JSON.stringify(owner)
    const target = document.querySelectorAll('button')[1]!
    const draft = document.querySelector('textarea')!
    let bounds = new DOMRect(56, 340, 195, 32)
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => bounds)
    if (appearance === 'anchor-only') document.querySelector('button')!.dataset.helpTarget = 'sibling'
    active = createGuideRuntime({ document: guide([{ ...step('open', 'button'), appearance: appearance === 'anchor-only' ? 'anchor-only' : 'spotlight', advanceOn: 'manual' }]), locale: 'en', currentView: 'packing', observedContext: owner, presentation: appearance === 'spotlight' ? { view: 'packing', target: { kind: 'instance', key: 'open', instance: 'packing:2' }, title: bilingual('Open review'), instructions: bilingual('Use the expected review') } : null })
    await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')?.getAttribute('d')).toContain('M51,330'))
    const popover = document.querySelector('.driver-popover')
    draft.focus()
    draft.setSelectionRange(2, 5)
    const scrollOwner = scroll === 'nested' ? scroller : window
    for (const top of [280, 250, 220]) {
      bounds = new DOMRect(56, top, 195, 32)
      scrollOwner.dispatchEvent(new Event('scroll'))
      await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')?.getAttribute('d')).toContain(`M51,${top - 10}`))
    }
    const overlay = document.querySelector('.driver-overlay path')!
    const updateOverlay = vi.spyOn(overlay, 'setAttribute')
    document.querySelector('.driver-popover-description')!.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(updateOverlay).not.toHaveBeenCalled()
    expect(document.querySelector('.driver-popover')).toBe(popover)
    expect(document.activeElement).toBe(draft)
    expect([draft.selectionStart, draft.selectionEnd]).toEqual([2, 5])
    expect(draft.value).toBe('Unsaved evidence')
    expect(active.state.value.step.id).toBe('open')
    expect(document.querySelector<SVGElement>('.driver-overlay')?.style.display).toBe(appearance === 'anchor-only' ? 'none' : '')
    active.destroy()
    bounds = new DOMRect(56, 100, 195, 32)
    scroller.dispatchEvent(new Event('scroll'))
    await Promise.resolve()
    expect(document.querySelector('.driver-popover')).toBeNull()
  })

  it('tracks the same native completion button after late assignment content moves it without changing focus or draft', async () => {
    document.body.innerHTML = '<main><div id="assignments"></div><textarea>Unsaved completion note</textarea><button data-help-target="complete">Complete Review</button></main>'
    const target = document.querySelector('button')!
    const draft = document.querySelector('textarea')!
    let bounds = new DOMRect(56, 340, 195, 32)
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => bounds)
    active = createGuideRuntime({ document: guide([{ ...step('complete', 'button'), advanceOn: 'manual' }]), locale: 'en', currentView: 'packing', observedContext: context })
    await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')?.getAttribute('d')).toContain('M51,330'))
    const overlay = document.querySelector('.driver-overlay path')!
    const updateOverlay = vi.spyOn(overlay, 'setAttribute')
    const popover = document.querySelector('.driver-popover')
    draft.focus()
    bounds = new DOMRect(56, 540, 195, 32)
    document.getElementById('assignments')!.innerHTML = '<label>Group</label><select><option>None</option></select>'
    await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')?.getAttribute('d')).toContain('M51,530'))
    expect(document.querySelector('.driver-active-element')).toBe(target)
    expect(document.querySelector('.driver-popover')).toBe(popover)
    expect(document.activeElement).toBe(draft)
    expect(draft.value).toBe('Unsaved completion note')
    expect(active.state.value.step.id).toBe('complete')
    expect(updateOverlay).toHaveBeenCalledOnce()
    document.getElementById('assignments')!.setAttribute('class', 'loaded')
    await Promise.resolve()
    expect(updateOverlay).toHaveBeenCalledOnce()
  })

  it('recomputes adaptive nonmodal sizing when document reflow changes available target space', async () => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    try {
      document.body.innerHTML = '<main><div id="assignments"></div><button data-help-target="complete">Complete Review</button></main>'
      const target = document.querySelector('button')!
      let bounds = new DOMRect(56, 340, 195, 32)
      vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => bounds)
      active = createGuideRuntime({ document: guide([{ ...step('complete', 'button'), advanceOn: 'manual' }]), locale: 'en', currentView: 'packing', observedContext: context })
      await vi.waitFor(() => expect(document.querySelector('.driver-overlay path')).not.toBeNull())
      const popover = document.querySelector<HTMLElement>('.driver-popover')!
      expect(popover.style.maxHeight).toBe('440px')
      bounds = new DOMRect(56, 540, 195, 32)
      document.getElementById('assignments')!.textContent = 'Late assignment controls'
      await vi.waitFor(() => expect(popover.style.maxHeight).toBe('508px'))
      expect(document.querySelector('.driver-popover')).toBe(popover)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height })
    }
  })

  it('defers guidance for an unrelated native Help dialog and resumes the same draft and cursor', async () => {
    document.body.innerHTML = '<main><section data-help-target="answer">Question heading</section><input value="Unsaved evidence"><button id="help">Help</button></main>'
    const onExit = vi.fn()
    active = createGuideRuntime({ document: guide([{ ...step('answer'), advanceOn: 'manual' as const }]), locale: 'en', currentView: 'packing', observedContext: context, onExit })
    const input = document.querySelector('input')!
    const business = document.querySelector('main')!
    business.setAttribute('aria-hidden', 'true')
    const help = document.createElement('aside')
    help.setAttribute('role', 'dialog')
    help.dataset.state = 'open'
    help.innerHTML = '<h2>Help</h2><button>Close</button>'
    document.body.append(help)
    await vi.waitFor(() => expect(document.querySelector('.driver-popover')).toBeNull())
    expect(active.state.value.step.id).toBe('answer')
    expect(input.value).toBe('Unsaved evidence')
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    help.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
    expect(onExit).not.toHaveBeenCalled()
    help.remove()
    business.removeAttribute('aria-hidden')
    await vi.waitFor(() => expect(active!.state.value.status).toBe('ready'))
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('answer')
    expect(active.state.value.step.id).toBe('answer')
    expect(input.value).toBe('Unsaved evidence')
  })

  it('retains a successful receipt during native Help and applies it only after Help closes', async () => {
    document.body.innerHTML = '<main><button data-help-target="save">Save</button><section data-help-target="end"></section></main>'
    const steps = [step('save', 'button'), step('end')]
    const channel = createGuideActionChannel()
    active = createGuideRuntime({ document: guide(steps), ledger: catalog(steps), locale: 'en', currentView: 'packing', observedContext: context, actionChannel: channel })
    const help = document.createElement('aside')
    help.setAttribute('role', 'dialog')
    help.dataset.state = 'open'
    help.textContent = 'Reference help'
    document.body.append(help)
    success(channel, source('save'))
    expect(active.state.value.step.id).toBe('save')
    expect(document.querySelector('.driver-popover')).toBeNull()
    help.remove()
    await vi.waitFor(() => expect(active!.state.value.step.id).toBe('end'))
  })

  it('validates owner binding independently from a known execution and rejects contradictory declarations', () => {
    const owner: GuideObservedContext = { kind: 'owner', binding: execution.binding, execution: null, view: 'packing', visitId: 'owner-visit', draftRevision: 0, facts: [] }
    expect(GuideObservedContextSchema.safeParse(owner).success).toBe(true)
    expect(GuideObservedContextSchema.safeParse({ ...owner, binding: null, execution: null }).success).toBe(true)
    expect(GuideObservedContextSchema.safeParse({ ...owner, binding: null, execution }).success).toBe(false)
    expect(GuideObservedContextSchema.safeParse({ ...owner, binding: { ...execution.binding, resourceId: 'other' }, execution }).success).toBe(false)
    expect(GuideObservedContextSchema.safeParse({ ...owner, execution }).success).toBe(true)
  })
  it('resolves a loaded general owner with no execution while rejecting a different bound record', () => {
    document.body.innerHTML = '<main id="current"><button data-help-target="risk">Risk Rating</button></main><main id="other"><button data-help-target="risk">Other Risk Rating</button></main>'
    const owner: GuideObservedContext = { kind: 'owner', binding: execution.binding, execution: null, view: 'packing', visitId: 'owner-visit', draftRevision: 0, facts: [] }
    document.getElementById('current')!.dataset.helpContext = JSON.stringify(owner)
    document.getElementById('other')!.dataset.helpContext = JSON.stringify({ ...owner, binding: { ...execution.binding, resourceId: 'other' } })
    active = createGuideRuntime({ document: guide([step('answer')]), locale: 'en', currentView: 'packing', observedContext: { ...owner, execution }, presentation: { view: 'packing', target: { kind: 'unique', key: 'risk' }, title: bilingual('Open the workflow'), instructions: bilingual('Use Risk Rating') } })
    expect(document.querySelector('[data-help-target].driver-active-element')?.textContent).toBe('Risk Rating')
    active.updateContext({ currentView: 'packing', locale: 'fr', observedContext: owner })
    expect(document.querySelector('[data-help-target].driver-active-element')?.textContent).toBe('Risk Rating')
  })
  it('preserves the business draft and input focus during recovery while keeping the authored cursor pinned', () => {
    document.body.innerHTML = '<section data-help-target="answer"><input value="Unsaved packing notes"></section><section data-help-target="end"></section><a href="/shipment" data-help-target="return">Back to shipment</a>'
    const input = document.querySelector('input')!
    active = createGuideRuntime({ document: guide([step('answer'), step('end')]), locale: 'en', currentView: 'packing', observedContext: context })
    active.select('end')
    input.focus()
    active.updateContext({ currentView: 'packing', locale: 'en', presentation: { view: 'packing', target: { kind: 'unique', key: 'return' }, title: bilingual('Return to intended task'), instructions: bilingual('Use Back to shipment') } })
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('Unsaved packing notes')
    expect(document.querySelector('.driver-popover-description[role="status"]')).not.toBeNull()
    active.select('answer')
    expect(active.state.value.step.id).toBe('end')
    expect(document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!.disabled).toBe(true)
    active.retry()
    expect(document.querySelector('.driver-popover-description[role="status"]')).toBeNull()
    expect(document.activeElement).toBe(input)
  })
  it('resolves ordered instance targets within the loaded execution and rejects duplicate visible instances', () => {
    document.body.innerHTML = '<main id="owner"><button data-help-target="view" data-help-instance="step:1">View</button><button data-help-target="view" data-help-instance="step:2">View</button></main><main id="other"><a data-help-target="open" data-help-instance="packing:1">Open</a></main>'
    const ownerContext: GuideObservedContext = { kind: 'owner', binding: execution.binding, execution, visitId: 'owner-visit', draftRevision: 0, view: 'packing', facts: [] }
    document.getElementById('owner')!.dataset.helpContext = JSON.stringify(ownerContext)
    document.getElementById('other')!.dataset.helpContext = JSON.stringify({ ...ownerContext, execution: { ...execution, executionId: 'other-attempt' } })
    const presentation = { view: 'packing', target: [{ kind: 'instance' as const, key: 'open', instance: 'packing:1' }, { kind: 'instance' as const, key: 'view', instance: 'step:1' }], title: bilingual('Open exact task'), instructions: bilingual('Use the application') }
    active = createGuideRuntime({ document: guide([step('answer')]), locale: 'en', currentView: 'packing', observedContext: ownerContext, presentation })
    expect(document.querySelector('.driver-active-element')?.textContent).toBe('View')
    const duplicate = document.querySelector('button')!.cloneNode(true)
    document.getElementById('owner')!.appendChild(duplicate)
    active.retry()
    expect(active.state.value.status).toBe('unavailable')
    expect(document.querySelector('[data-help-target].driver-active-element')).toBeNull()
    expect(document.querySelector('.gcs-guide-step-select')).toBeNull()
  })
})
