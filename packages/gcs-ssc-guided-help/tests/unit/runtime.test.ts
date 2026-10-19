// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGuideRuntime, signalGuideCompletion } from './runtime-fixture'

const guide = { formatVersion: 1 as const, title: { en: 'Help', fr: 'Aide' }, description: { en: 'Help', fr: 'Aide' }, steps: [
  { id: 'name', view: 'agency.general', target: 'agency.name', kind: 'text' as const, title: { en: 'Name', fr: 'Nom' }, instructions: { en: 'Type here', fr: 'Saisir ici' } },
  { id: 'save', view: 'agency.general', target: 'agency.save', kind: 'button' as const, title: { en: 'Save', fr: 'Enregistrer' }, instructions: { en: 'Click Save', fr: 'Cliquer Enregistrer' } }
] }
afterEach(() => {
  document.body.innerHTML = ''
})
describe('manual guide runtime', () => {
  it('keeps typing and target clicks on the same step and allows portalled controls', async () => {
    document.body.innerHTML = '<main data-help-view="agency.general"><input data-help-target="agency.name"><button data-help-target="agency.save">Save</button></main><div role="listbox">Popup</div>'
    const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
    await vi.waitFor(() => expect(document.querySelector('.driver-overlay')).not.toBeNull())
    expect(runtime.state.value.status).toBe('ready')
    document.querySelector('input')!.click()
    document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(runtime.state.value.step.id).toBe('name')
    expect(document.querySelector<SVGElement>('.driver-overlay')?.style.pointerEvents).toBe('none')
    runtime.select('save')
    expect(runtime.state.value.step.id).toBe('save')
    runtime.destroy()
    expect(document.querySelector('.driver-overlay')).toBeNull()
  })
})

describe('target recovery', () => {
  it('never navigates or guesses when a target is missing or duplicated', () => {
    document.body.innerHTML = '<main data-help-view="agency.general"><input data-help-target="agency.name"><input data-help-target="agency.name"></main>'
    const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'another.screen' })
    expect(runtime.state.value.status).toBe('wrong-view')
    expect(document.querySelector('.gcs-guide-retry')).toBeNull()
    runtime.updateContext({ currentView: 'agency.general', locale: 'fr' })
    expect(runtime.state.value.status).toBe('unavailable')
    document.querySelector('input')!.remove()
    runtime.retry()
    expect(runtime.state.value.status).toBe('ready')
    runtime.select('unknown')
    expect(runtime.state.value.step.id).toBe('name')
    runtime.destroy()
  })
  it('treats hidden targets as unavailable and keeps manual recovery possible', () => {
    document.body.innerHTML = '<main data-help-view="agency.general"><div hidden><input data-help-target="agency.name"></div></main>'
    const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
    expect(runtime.state.value.status).toBe('unavailable')
    document.querySelector('div')!.hidden = false
    runtime.retry()
    expect(runtime.state.value.status).toBe('ready')
    runtime.destroy()
  })
})

it('waits briefly for a lazily rendered control without changing the selected step', async () => {
  document.body.innerHTML = '<main data-help-view="agency.general"></main>'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  expect(runtime.state.value.status).toBe('unavailable')
  document.querySelector('main')!.innerHTML = '<input data-help-target="agency.name">'
  await vi.waitFor(() => expect(runtime.state.value.status).toBe('ready'))
  expect(runtime.state.value.step.id).toBe('name')
  runtime.destroy()
})

it('discovers a view mounted after launch and rejects CSS-hidden ancestors', async () => {
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  document.body.innerHTML = '<main data-help-view="agency.general"><div style="display:none"><input data-help-target="agency.name"></div></main>'
  await Promise.resolve()
  expect(runtime.state.value.status).toBe('unavailable')
  document.querySelector<HTMLElement>('main div')!.style.display = 'block'
  await vi.waitFor(() => expect(runtime.state.value.status).toBe('ready'))
  runtime.destroy()
})

it('highlights unique modal portal fields outside the owning view without navigating', () => {
  document.body.innerHTML = '<main data-help-view="agency.general"></main><div role="dialog"><input data-help-target="agency.name"><button data-help-target="agency.save">Save</button></div>'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  expect(runtime.state.value.status).toBe('ready')
  expect(document.querySelector('input')?.classList.contains('driver-active-element')).toBe(true)
  runtime.select('save')
  expect(document.querySelector('button')?.classList.contains('driver-active-element')).toBe(true)
  runtime.destroy()
})

it('renders a real anchored popover with safe Markdown and explicit manual controls', () => {
  document.body.innerHTML = '<input data-help-target="agency.name"><button data-help-target="agency.save">Save</button>'
  const onSelect = vi.fn()
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[0]!, title: { en: '<img src=x onerror=alert(1)>', fr: 'Nom' }, instructions: { en: 'Type **here**', fr: 'Saisir ici' } }, guide.steps[1]!] }, locale: 'en', currentView: 'agency.general', onSelect, onExit })
  expect(document.querySelector('.driver-popover')).not.toBeNull()
  expect(document.querySelector('.driver-popover-title img')).toBeNull()
  expect(document.querySelector('.driver-popover-description strong')?.textContent).toBe('here')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')?.disabled).toBe(true)
  expect(document.querySelector('.driver-popover-progress-text')?.textContent).toBe('1 of 2')
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(onSelect).toHaveBeenCalledWith('save', ['name', 'save'])
  expect(document.querySelector('.driver-popover-next-btn')?.textContent).toBe('Exit')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  signalGuideCompletion({ target: 'agency.save', action: 'save-success' })
  expect(onExit).toHaveBeenCalledOnce()
  expect(document.querySelector('.driver-popover')).toBeNull()
  runtime.select('name')
  runtime.retry()
  expect(document.querySelector('.driver-popover')).toBeNull()
})

it('keeps popover controls inside a portalled modal focus boundary and recovers after its target disappears', async () => {
  document.body.innerHTML = '<main data-help-view="agency.general"></main><div role="dialog" data-state="open"><input data-help-target="agency.name"></div>'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  expect(document.querySelector('[role="dialog"] .gcs-guide-modal-host .driver-popover')).not.toBeNull()
  document.querySelector('input')!.remove()
  await vi.waitFor(() => expect(runtime.state.value.status).toBe('unavailable'))
  expect(document.querySelector('.driver-popover-description')?.textContent).toContain('This control is unavailable')
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Name')
  runtime.destroy()
  expect(document.querySelector('.gcs-guide-modal-host')).toBeNull()
})

it('selects any step from a labelled compact chooser and keeps preview warnings safe', () => {
  const onSelect = vi.fn()
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'other', notice: '<b>Live application preview</b>', onSelect })
  expect(document.querySelector('.gcs-guide-status')?.textContent).toBe('<b>Live application preview</b>')
  expect(document.querySelector('.gcs-guide-status b')).toBeNull()
  const chooser = document.querySelector<HTMLSelectElement>('.gcs-guide-step-select')!
  expect(chooser.closest('label')?.textContent).toContain('Steps')
  chooser.value = 'save'
  chooser.dispatchEvent(new Event('change', { bubbles: true }))
  expect(onSelect).toHaveBeenCalledWith('save', ['name', 'save'])
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Save')
  runtime.destroy()
})

it('shares modal layers, tracks responsive geometry, and restores exact dialog clipping', async () => {
  document.body.innerHTML = '<div role="dialog" data-state="open" style="overflow:hidden !important;color:red"><input data-help-target="agency.name"></div>'
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  let left = 300
  let top = 200
  vi.spyOn(dialog, 'getBoundingClientRect').mockImplementation(() => ({ left, top, right: left + 400, bottom: top + 300, width: 400, height: 300 }) as DOMRect)
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  expect(dialog.style.getPropertyValue('overflow')).toBe('visible')
  const host = document.querySelector<HTMLElement>('.gcs-guide-modal-host')!
  expect(host.style.transform).toBe('translate(-300px, -200px)')
  await vi.waitFor(() => expect(host.querySelector('.driver-overlay')).not.toBeNull())
  expect(host.querySelector('.driver-popover')).not.toBeNull()
  left = 16
  top = 150
  window.dispatchEvent(new Event('resize'))
  expect(host.style.transform).toBe('translate(-16px, -150px)')
  runtime.destroy()
  expect(dialog.style.getPropertyValue('overflow')).toBe('hidden')
  expect(dialog.style.getPropertyPriority('overflow')).toBe('important')
  expect(dialog.style.color).toBe('red')
  expect(document.querySelector('.driver-overlay')).toBeNull()
})

it('Escape exits once without dismissing the underlying business modal or intercepting field arrows', () => {
  document.body.innerHTML = '<div role="dialog" data-state="open"><input data-help-target="agency.name"></div>'
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general', onExit })
  const closeModal = vi.fn()
  document.addEventListener('keydown', closeModal)
  const input = document.querySelector('input')!
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  expect(closeModal).toHaveBeenCalledOnce()
  closeModal.mockClear()
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  input.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(true)
  expect(closeModal).not.toHaveBeenCalled()
  expect(onExit).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  document.removeEventListener('keydown', closeModal)
  runtime.destroy()
})

it('advances edited nonblank valid fields on blur, never untouched, blank, invalid, or unrelated fields', () => {
  document.body.innerHTML = '<input data-help-target="agency.name" required value="Existing"><input id="other">'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  const blur = () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  document.querySelector('#other')!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  input.value = ' '
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  input.value = 'Edited'
  input.setCustomValidity('Rejected')
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  input.setCustomValidity('')
  blur()
  expect(runtime.state.value.step.id).toBe('save')
  blur()
  expect(runtime.state.value.step.id).toBe('save')
  runtime.destroy()
})

it('accepts matching host completion only and does not advance on a save click or failed save', () => {
  document.body.innerHTML = '<button data-help-target="agency.save">Save</button>'
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: guide, initialStepId: 'save', locale: 'en', currentView: 'agency.general', onExit })
  const signal = (detail: unknown) => signalGuideCompletion(detail)
  document.querySelector('button')!.click()
  for (const detail of [null, {}, { target: 'other', action: 'save-success' }, { target: 'agency.save', action: 'save-failed' }]) signal(detail)
  expect(onExit).not.toHaveBeenCalled()
  signal({ target: 'agency.save', action: 'save-success' })
  signal({ target: 'agency.save', action: 'save-success' })
  expect(onExit).toHaveBeenCalledOnce()
  runtime.destroy()
})

it('advances a button when the host confirms its modal opened and preserves manual opt-out', () => {
  const documentGuide = { ...guide, steps: [{ ...guide.steps[1]!, id: 'add' }, ...guide.steps] }
  document.body.innerHTML = '<button data-help-target="agency.save">Add</button><input data-help-target="agency.name">'
  const runtime = createGuideRuntime({ document: documentGuide, locale: 'en', currentView: 'agency.general' })
  signalGuideCompletion({ target: 'agency.save', action: 'modal-open' })
  expect(runtime.state.value.step.id).toBe('name')
  runtime.destroy()
  const manual = createGuideRuntime({ document: { ...guide, steps: guide.steps.map(step => ({ ...step, advanceOn: 'manual' as const })) }, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.value = 'Edited'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  expect(manual.state.value.step.id).toBe('name')
  manual.select('save')
  signalGuideCompletion({ target: 'agency.save', action: 'save-success' })
  expect(document.querySelector('.driver-popover')).not.toBeNull()
  manual.destroy()
})

it('ignores stale Next and chooser events after field blur advances the step', () => {
  document.body.innerHTML = '<input data-help-target="agency.name"><button data-help-target="agency.save">Save</button>'
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general', onExit })
  const next = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!
  const chooser = document.querySelector<HTMLSelectElement>('.gcs-guide-step-select')!
  const input = document.querySelector('input')!
  input.value = 'Entered'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  next.click()
  chooser.value = 'name'
  chooser.dispatchEvent(new Event('change'))
  expect(runtime.state.value.step.id).toBe('save')
  expect(onExit).not.toHaveBeenCalled()
  runtime.destroy()
})

it('waits for native and schema validity before completing an edited field', () => {
  document.body.innerHTML = '<div data-help-target="agency.name"><input></div>'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.value = 'Entered'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  const blur = () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  input.setAttribute('aria-invalid', 'true')
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  input.removeAttribute('aria-invalid')
  input.parentElement!.setAttribute('aria-invalid', 'true')
  blur()
  expect(runtime.state.value.step.id).toBe('name')
  input.parentElement!.removeAttribute('aria-invalid')
  blur()
  expect(runtime.state.value.step.id).toBe('save')
  runtime.destroy()
})

it('does not infer complete dates from individual date segments', () => {
  document.body.innerHTML = '<div data-help-target="agency.name"><input inputmode="numeric"></div>'
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[0]!, kind: 'date' }, guide.steps[1]!] }, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.value = '12'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  expect(runtime.state.value.step.id).toBe('name')
  input.type = 'date'
  input.value = '2026-10-15'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  expect(runtime.state.value.step.id).toBe('save')
  runtime.destroy()
})

it('keeps automatic completion focus on the next business control instead of Driver controls', () => {
  document.body.innerHTML = '<button data-help-target="agency.add">Add</button><div role="dialog" data-state="open"><input data-help-target="agency.name"><button data-help-target="agency.save">Save</button></div>'
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[1]!, id: 'add', target: 'agency.add' }, ...guide.steps] }, locale: 'en', currentView: 'agency.general' })
  signalGuideCompletion({ target: 'agency.add', action: 'modal-open' })
  const input = document.querySelector('input')!
  expect(document.activeElement).toBe(input)
  input.value = 'Entered'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  expect(document.activeElement).toBe(document.querySelector('[data-help-target="agency.save"]'))
  runtime.destroy()
})

it('gates Next, chooser and public forward selection on completed actions while allowing blank text skips', async () => {
  document.body.innerHTML = '<button data-help-target="agency.add">Add</button>'
  const documentGuide = { ...guide, steps: [{ ...guide.steps[1]!, id: 'add', target: 'agency.add', advanceOn: 'manual' as const }, { ...guide.steps[0]!, advanceOn: 'manual' as const }, { ...guide.steps[1]!, advanceOn: 'manual' as const }] }
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: documentGuide, locale: 'en', currentView: 'agency.general', onExit })
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  expect(document.querySelector<HTMLOptionElement>('.gcs-guide-step-select option[value="save"]')!.disabled).toBe(true)
  runtime.select('save')
  expect(runtime.state.value.step.id).toBe('add')
  document.body.insertAdjacentHTML('beforeend', '<div role="dialog" data-state="open"><input data-help-target="agency.name"><button data-help-target="agency.save">Save</button></div>')
  signalGuideCompletion({ target: 'agency.add', action: 'modal-open' })
  expect(runtime.state.value.step.id).toBe('add')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(false)
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(runtime.state.value.step.id).toBe('name')
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(runtime.state.value.step.id).toBe('save')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  signalGuideCompletion({ target: 'agency.save', action: 'save-success' })
  document.querySelector('[role="dialog"]')!.remove()
  await Promise.resolve()
  expect(runtime.state.value.step.id).toBe('save')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(false)
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(onExit).toHaveBeenCalledOnce()
})

it('requires reopening a cancelled modal and restores stale session steps to their first action', async () => {
  document.body.innerHTML = '<button data-help-target="agency.add">Add</button>'
  const documentGuide = { ...guide, steps: [{ ...guide.steps[1]!, id: 'add', target: 'agency.add' }, ...guide.steps] }
  const onSelect = vi.fn()
  const runtime = createGuideRuntime({ document: documentGuide, initialStepId: 'save', locale: 'en', currentView: 'agency.general', onSelect })
  expect(runtime.state.value.step.id).toBe('add')
  expect(onSelect).toHaveBeenCalledWith('add', ['add'])
  document.body.insertAdjacentHTML('beforeend', '<div role="dialog" data-state="open"><input data-help-target="agency.name"></div>')
  signalGuideCompletion({ target: 'agency.add', action: 'modal-open' })
  expect(runtime.state.value.step.id).toBe('name')
  document.querySelector('[role="dialog"]')!.remove()
  await vi.waitFor(() => expect(runtime.state.value.step.id).toBe('add'))
  runtime.select('save')
  expect(runtime.state.value.step.id).toBe('add')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  runtime.destroy()
})

it('keeps an open modal workflow when a portalled dropdown temporarily hides it from accessibility', async () => {
  document.body.innerHTML = '<button data-help-target="agency.add">Add</button><div role="dialog" data-state="open"><input data-help-target="agency.name"></div>'
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[1]!, id: 'add', target: 'agency.add' }, ...guide.steps] }, locale: 'en', currentView: 'agency.general' })
  signalGuideCompletion({ target: 'agency.add', action: 'modal-open' })
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  dialog.setAttribute('aria-hidden', 'true')
  await vi.waitFor(() => expect(runtime.state.value.status).toBe('unavailable'))
  expect(runtime.state.value.step.id).toBe('name')
  dialog.removeAttribute('aria-hidden')
  await vi.waitFor(() => expect(runtime.state.value.status).toBe('ready'))
  expect(runtime.state.value.step.id).toBe('name')
  runtime.destroy()
})

it('revokes modal completion when a retained dialog changes to closed', async () => {
  document.body.innerHTML = '<button data-help-target="agency.add">Add</button><div role="dialog" data-state="open"><input data-help-target="agency.name"></div>'
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[1]!, id: 'add', target: 'agency.add' }, ...guide.steps] }, locale: 'en', currentView: 'agency.general' })
  signalGuideCompletion({ target: 'agency.add', action: 'modal-open' })
  expect(runtime.state.value.step.id).toBe('name')
  document.querySelector<HTMLElement>('[role="dialog"]')!.dataset.state = 'closed'
  await vi.waitFor(() => expect(runtime.state.value.step.id).toBe('add'))
  runtime.select('save')
  expect(runtime.state.value.step.id).toBe('add')
  expect(document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.disabled).toBe(true)
  runtime.destroy()
})

it('completes an edited departed field when asynchronous schema validation clears its error', async () => {
  document.body.innerHTML = '<input data-help-target="agency.name" aria-invalid="true">'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.value = 'Corrected'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await Promise.resolve()
  expect(runtime.state.value.step.id).toBe('name')
  input.setAttribute('aria-invalid', 'false')
  await vi.waitFor(() => expect(runtime.state.value.step.id).toBe('save'))
  runtime.destroy()
})

it('never completes from validity changes alone, refocused controls, or stale departed steps', async () => {
  document.body.innerHTML = '<input data-help-target="agency.name" aria-invalid="true">'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.value = 'Corrected'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  input.setAttribute('aria-invalid', 'false')
  await Promise.resolve()
  expect(runtime.state.value.step.id).toBe('name')
  input.setAttribute('aria-invalid', 'true')
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  input.focus()
  input.setAttribute('aria-invalid', 'false')
  await Promise.resolve()
  expect(runtime.state.value.step.id).toBe('name')
  input.setAttribute('aria-invalid', 'true')
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  runtime.select('save')
  runtime.select('name')
  input.setAttribute('aria-invalid', 'false')
  await Promise.resolve()
  expect(runtime.state.value.step.id).toBe('name')
  runtime.destroy()
})

it('fits modal help into a desktop side gutter and switches to in-flow help on narrow viewports', () => {
  document.body.innerHTML = '<div role="dialog" data-state="open"><input data-help-target="agency.name"><footer><button>Cancel</button></footer></div>'
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  let bounds = { left: 384, top: 200, right: 896, bottom: 520, width: 512, height: 320 }
  vi.spyOn(dialog, 'getBoundingClientRect').mockImplementation(() => bounds as DOMRect)
  const previousWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  let popover = dialog.querySelector<HTMLElement>('.driver-popover')!
  expect(popover.style.width).toBe('360px')
  expect(popover.closest('.gcs-guide-modal-host')).not.toBeNull()
  bounds = { left: 16, top: 100, right: 374, bottom: 420, width: 358, height: 320 }
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  window.dispatchEvent(new Event('resize'))
  popover = dialog.querySelector<HTMLElement>('.driver-popover')!
  expect(popover.classList.contains('gcs-guide-modal-inline')).toBe(true)
  expect(popover.parentElement).toBe(dialog)
  expect(dialog.querySelector('footer')!.compareDocumentPosition(popover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(popover.closest('.gcs-guide-modal-host')).toBeNull()
  runtime.destroy()
  Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true })
})

it('keeps narrow modal guidance above its spotlight overlay layer', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/style.css'), 'utf8').replace(/@import[^;]+;/g, '')
  document.body.appendChild(style)
  document.body.insertAdjacentHTML('beforeend', '<div role="dialog" data-state="open"><input data-help-target="agency.name"></div>')
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 16, top: 100, right: window.innerWidth - 16, bottom: 420, width: window.innerWidth - 32, height: 320 } as DOMRect)
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const popover = dialog.querySelector<HTMLElement>('.gcs-guide-modal-inline')!
  const overlayHost = dialog.querySelector<HTMLElement>('.gcs-guide-modal-host')!
  expect(Number(getComputedStyle(popover).zIndex)).toBeGreaterThan(Number(getComputedStyle(overlayHost).zIndex))
  runtime.destroy()
})

it('preserves edited field focus and step during responsive popover reconstruction', () => {
  document.body.innerHTML = '<div role="dialog" data-state="open"><input data-help-target="agency.name"></div>'
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  let bounds = { left: 384, top: 200, right: 896, bottom: 520, width: 512, height: 320 }
  vi.spyOn(dialog, 'getBoundingClientRect').mockImplementation(() => bounds as DOMRect)
  const previousWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const input = document.querySelector('input')!
  input.focus()
  input.value = 'Keep typing during rotation'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  bounds = { left: 16, top: 100, right: 374, bottom: 420, width: 358, height: 320 }
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  window.dispatchEvent(new Event('resize'))
  expect(runtime.state.value.step.id).toBe('name')
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('Keep typing during rotation')
  input.blur()
  expect(runtime.state.value.step.id).toBe('save')
  runtime.destroy()
  Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true })
})

it('places a narrow switch popover outside the entire modal rather than over other fields and footer actions', () => {
  const style = document.createElement('style')
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  style.textContent = `${readFileSync(resolve(packageRoot, 'node_modules/driver.js/dist/driver.css'), 'utf8')}\n${readFileSync(resolve(packageRoot, 'src/style.css'), 'utf8').replace(/@import[^;]+;/g, '')}`
  document.body.appendChild(style)
  document.body.insertAdjacentHTML('beforeend', '<div role="dialog" data-state="open"><button role="switch" data-help-target="agency.name">Active</button><input><footer><button>Cancel</button><button>Update</button></footer></div>')
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  const control = document.querySelector<HTMLElement>('[role="switch"]')!
  const previousWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === dialog) return { left: 384, top: 200, right: 896, bottom: 650, width: 512, height: 450 } as DOMRect
    if (this === control) return { left: 408, top: 400, right: 452, bottom: 428, width: 44, height: 28 } as DOMRect
    if (this.classList.contains('driver-popover')) return { left: 0, top: 0, right: 360, bottom: 270, width: 360, height: 270 } as DOMRect
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect
  })
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const popover = dialog.querySelector<HTMLElement>('.driver-popover')!
  expect(popover.classList.contains('driver-popover-side-right')).toBe(true)
  const popoverLeft = window.innerWidth - Number.parseFloat(popover.style.right) - 360
  expect(popoverLeft).toBeGreaterThanOrEqual(dialog.getBoundingClientRect().right + 12)
  runtime.destroy()
  geometry.mockRestore()
  Object.defineProperty(window, 'innerWidth', { value: previousWidth, configurable: true })
})

it('finishes instruction groups without exiting or implying business completion', () => {
  document.body.innerHTML = '<main data-help-view="agency.general"><section data-help-target="agency.name"></section></main>'
  const onFinish = vi.fn()
  const onExit = vi.fn()
  const documentGuide = { ...guide, steps: [{ ...guide.steps[0]!, kind: 'section' as const }] }
  const runtime = createGuideRuntime({ document: documentGuide, locale: 'en', currentView: 'agency.general', finishLabel: 'Instructions reviewed', onFinish, onExit })
  const next = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!
  expect(next.textContent).toBe('Instructions reviewed')
  next.click()
  expect(onFinish).toHaveBeenCalledOnce()
  expect(onExit).not.toHaveBeenCalled()
  expect(document.querySelector('.driver-popover')).not.toBeNull()
  document.querySelector<HTMLButtonElement>('.driver-popover-close-btn')!.click()
  expect(onExit).toHaveBeenCalledOnce()
  runtime.destroy()
})

it('keeps task context and waits inside the standard spotlight controls', () => {
  document.body.innerHTML = '<main data-help-view="agency.general"><section data-help-target="agency.name"></section></main>'
  const onFinish = vi.fn()
  const single = { ...guide, steps: [{ ...guide.steps[0]!, kind: 'section' as const }] }
  const runtime = createGuideRuntime({ document: single, locale: 'en', currentView: 'agency.general', context: 'Reviews · First review', finishLabel: 'Next', onFinish })
  expect(document.querySelector('.driver-popover-description')?.textContent).toContain('Reviews · First review')
  expect(document.querySelector('.gcs-guide-retry')).toBeNull()
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(onFinish).toHaveBeenCalledOnce()
  runtime.updateContext({ currentView: 'agency.general', locale: 'en', statusMessage: 'Complete the work to continue.', finishDisabled: true })
  expect(document.querySelector('.driver-popover [role="status"]')?.textContent).toBe('Complete the work to continue.')
  expect(document.querySelector('.gcs-guide-step-select')).not.toBeNull()
  expect(document.querySelector('.driver-popover-prev-btn')).not.toBeNull()
  expect(document.querySelector('.driver-popover-close-btn')).not.toBeNull()
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(onFinish).toHaveBeenCalledOnce()
  runtime.updateContext({ currentView: 'agency.general', locale: 'fr', statusMessage: undefined, finishDisabled: false, finishLabel: 'Suivant' })
  expect(document.querySelector('.driver-popover-next-btn')?.textContent).toBe('Suivant')
  expect(document.querySelector('.driver-popover [role="status"]')).toBeNull()
  expect(document.querySelector('.gcs-guide-retry')).toBeNull()
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  expect(onFinish).toHaveBeenCalledTimes(2)
  runtime.destroy()
})

it('suspends all task instructions, highlighting and navigation outside an authorized business context', () => {
  document.body.innerHTML = '<main data-help-view="agency.general"><input data-help-target="agency.name"><button data-help-target="agency.save">Save</button></main>'
  const onSelect = vi.fn()
  const onFinish = vi.fn()
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general', suspended: true, statusMessage: 'Return to the selected record.', onSelect, onFinish })
  expect(runtime.state.value.status).toBe('unavailable')
  const popover = document.querySelector('.driver-popover')!
  expect(popover.textContent).toContain('Return to the selected record.')
  expect(popover.querySelector<HTMLElement>('.driver-popover-description')?.style.display).toBe('block')
  expect(popover.textContent).not.toContain('Type here')
  expect(popover.textContent).not.toContain('Click Save')
  expect(popover.querySelector('.gcs-guide-step-select')).toBeNull()
  expect(document.querySelector('[data-help-target].driver-active-element')).toBeNull()
  runtime.select('save')
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  signalGuideCompletion({ target: 'agency.save', action: 'save-success' })
  expect(runtime.state.value.step.id).toBe('name')
  expect(onSelect).not.toHaveBeenCalled()
  expect(onFinish).not.toHaveBeenCalled()
  runtime.updateContext({ currentView: 'agency.general', locale: 'en', suspended: false, statusMessage: undefined })
  expect(document.querySelector('.driver-popover-description')?.textContent).toContain('Type here')
  expect(document.querySelector('.gcs-guide-step-select')).not.toBeNull()
  expect(runtime.state.value.status).toBe('ready')
  runtime.destroy()
})

it('accepts Save completion only for a unique visible target on the active guided view', () => {
  document.body.innerHTML = '<button data-help-target="agency.save">Save</button>'
  const saveOnly = { ...guide, steps: [{ ...guide.steps[1]!, advanceOn: 'manual' as const }] }
  const onExit = vi.fn()
  const runtime = createGuideRuntime({ document: saveOnly, locale: 'en', currentView: '', onExit })
  const signal = () => signalGuideCompletion({ target: 'agency.save', action: 'save-success' })
  const next = () => document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!.click()
  signal()
  next()
  expect(onExit).not.toHaveBeenCalled()
  runtime.updateContext({ currentView: 'agency.general', locale: 'en' })
  document.querySelector<HTMLButtonElement>('[data-help-target]')!.hidden = true
  signal()
  next()
  expect(onExit).not.toHaveBeenCalled()
  document.querySelector<HTMLButtonElement>('[data-help-target]')!.hidden = false
  const duplicate = document.createElement('button')
  duplicate.dataset.helpTarget = 'agency.save'
  document.body.appendChild(duplicate)
  signal()
  next()
  expect(onExit).not.toHaveBeenCalled()
  duplicate.remove()
  const target = document.querySelector<HTMLButtonElement>('[data-help-target]')!
  target.remove()
  signal()
  next()
  expect(onExit).not.toHaveBeenCalled()
  document.body.appendChild(target)
  signal()
  next()
  expect(onExit).toHaveBeenCalledOnce()
  runtime.destroy()
})

it('keeps navigation outside the scrollable long-instruction body', () => {
  document.body.innerHTML = '<input data-help-target="agency.name">'
  const longGuide = { ...guide, steps: [{ ...guide.steps[0]!, instructions: { en: 'Long instructions.\n\n'.repeat(100), fr: 'Longues instructions.\n\n'.repeat(100) } }] }
  const runtime = createGuideRuntime({ document: longGuide, locale: 'en', currentView: 'agency.general' })
  const popover = document.querySelector<HTMLElement>('.driver-popover')!
  expect(popover.style.display).toBe('flex')
  const body = popover.querySelector<HTMLElement>('.driver-popover-description')!
  expect(body.textContent).toContain('Long instructions.')
  for (const selector of ['.driver-popover-title', '.gcs-guide-step-label', '.driver-popover-footer', '.driver-popover-close-btn']) {
    const control = popover.querySelector(selector)
    expect(control).not.toBeNull()
    expect(body.contains(control)).toBe(false)
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const styles = readFileSync(resolve(packageRoot, 'src/style.css'), 'utf8')
  expect(styles).toContain('max-height: min(32rem, calc(100dvh - 24px))')
  expect(styles).toContain('.gcs-guide-popover .driver-popover-description { min-height: 0; overflow-y: auto;')
  runtime.destroy()
})

it('re-resolves nonmodal targets and refreshes native viewport placement on resize', () => {
  document.body.innerHTML = '<input data-help-target="agency.name">'
  const runtime = createGuideRuntime({ document: guide, locale: 'en', currentView: 'agency.general' })
  const original = document.querySelector('.driver-popover')
  document.querySelector('input')!.remove()
  window.dispatchEvent(new Event('resize'))
  expect(runtime.state.value.status).toBe('unavailable')
  expect(document.querySelector('.driver-popover')).not.toBe(original)
  const input = document.createElement('input')
  input.dataset.helpTarget = 'agency.name'
  document.body.appendChild(input)
  window.dispatchEvent(new Event('resize'))
  expect(runtime.state.value.status).toBe('ready')
  expect(runtime.state.value.step.id).toBe('name')
  runtime.destroy()
})

it('prefers native side placement for a section when bottom placement would cover its controls', () => {
  document.body.innerHTML = '<main data-help-view="agency.general"><section data-help-target="agency.name"></section><input></main>'
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  const target = document.querySelector('section')!
  const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === target) return new DOMRect(278, 215, 483, 52)
    if (this.classList.contains('driver-popover')) return new DOMRect(0, 0, 400, 300)
    return new DOMRect()
  })
  const runtime = createGuideRuntime({ document: { ...guide, steps: [{ ...guide.steps[0]!, kind: 'section' as const }] }, locale: 'en', currentView: 'agency.general' })
  const popover = document.querySelector<HTMLElement>('.driver-popover')!
  expect(popover.querySelector('.driver-popover-arrow-side-right')).not.toBeNull()
  const left = window.innerWidth - Number.parseFloat(popover.style.right) - 400
  expect(left).toBeGreaterThan(target.getBoundingClientRect().right)
  expect(left + 400).toBeLessThanOrEqual(window.innerWidth)
  runtime.destroy()
  geometry.mockRestore()
  Object.defineProperty(window, 'innerWidth', { value: viewportWidth, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: viewportHeight, configurable: true })
})
