import { driver } from 'driver.js'
import type { Alignment, Side } from 'driver.js'
import { shallowRef } from 'vue'
import { isGuidePath } from './contracts'
import type { GuideDocument, GuideStep, TargetLedger } from './contracts'
import { guideActionKey, guideContextIdentity, guideTargetIdentity, GuideObservedContextSchema } from './actions'
import type { GuideActionChannel, GuideActionSignal, GuideActionSource, GuideObservedContext, GuidePresentation, GuideTargetRef } from './actions'
import { renderSafeMarkdown } from './markdown'

export * from './actions'

export type GuideTargetValue = string | boolean | null | undefined
export type GuideLocale = 'en' | 'fr'
export type GuideTargetStatus = 'ready' | 'wrong-view' | 'unavailable'
export interface GuideRuntimeState { step: GuideStep; status: GuideTargetStatus }
export interface GuideRuntimeOptions {
  document: GuideDocument
  locale: GuideLocale
  currentView: string
  initialStepId?: string
  initialPath?: string[]
  readTargetValue?: (target: string) => GuideTargetValue
  root?: ParentNode
  onSelect?: (stepId: string, path: string[]) => void
  onExit?: () => void
  onFinish?: () => void
  finishLabel?: string
  notice?: string
  context?: string
  statusMessage?: string
  finishDisabled?: boolean
  suspended?: boolean
  ledger?: TargetLedger
  actionChannel?: GuideActionChannel
  observedContext?: GuideObservedContext
  presentation?: GuidePresentation | null
  onSignal?: (signal: GuideActionSignal) => void
}

/** Read native structured values, host combobox keys or accessible checkbox state.
 * @param root Host DOM root.
 * @param key Stable registered target.
 * @returns Typed value; undefined means unavailable, null means unselected.
 */
export const readGuideTargetValue = (root: ParentNode, key: string): GuideTargetValue => {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-help-target]')).filter(element => element.dataset.helpTarget === key)
  if (matches.length !== 1) return undefined
  const element = matches[0]!
  const selector = 'select,input[type="checkbox"],[role="checkbox"],[role="switch"],[role="combobox"][data-help-value]'
  const controls = element.matches(selector) ? [element] : Array.from(element.querySelectorAll<HTMLElement>(selector))
  if (controls.length !== 1) return undefined
  const control = controls[0]!
  if (!control.isConnected) return undefined
  let ancestor: HTMLElement | null = control
  while (ancestor) {
    if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' || getComputedStyle(ancestor).display === 'none' || getComputedStyle(ancestor).visibility === 'hidden') return undefined
    ancestor = ancestor.parentElement
  }
  if (control.matches('[role="combobox"][data-help-value]')) return control.dataset.helpValue || null
  if (control instanceof HTMLSelectElement && !control.multiple) return control.value || null
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.indeterminate ? undefined : control.checked
  if (control?.matches('[role="checkbox"],[role="switch"]')) {
    const checked = control.getAttribute('aria-checked')
    return checked === 'true' ? true : checked === 'false' ? false : undefined
  }
  return undefined
}

/** Parse the host-owned context declaration at the DOM boundary.
 * @param element Native control's nearest declared context root.
 * @returns Validated loaded context, or null for stale/invalid declarations.
 */
const readElementContext = (element: HTMLElement): GuideObservedContext | null => {
  try {
    const parsed = GuideObservedContextSchema.safeParse(JSON.parse(element.dataset.helpContext ?? ''))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Create optional, non-navigating guidance with an anchored Driver popover.
 * @param options Published snapshot and current application context.
 * @returns Manual controls and observable target availability.
 */
export const createGuideRuntime = (options: GuideRuntimeOptions) => {
  let currentView = options.currentView
  let locale = options.locale
  let notice = options.notice
  let context = options.context
  let statusMessage = options.statusMessage
  let suspended = options.suspended
  let finishLabel = options.finishLabel
  let finishDisabled = options.finishDisabled
  let observedContext: GuideObservedContext = options.observedContext ?? { kind: 'elsewhere', view: options.currentView }
  let lastLoadedContext = observedContext
  let presentation = options.presentation
  const receipts = new Map<string, GuideActionSource>()
  let releaseChannel: (() => void) | null = null
  const root = options.root ?? window.document
  const requested = options.document.steps.find(step => step.id === options.initialStepId) ?? options.document.steps[0]
  const requestedPath = requested && isGuidePath(options.document, options.initialPath, requested.id) ? options.initialPath : options.document.steps.every(step => !step.flow) ? options.document.steps.slice(0, options.document.steps.indexOf(requested!) + 1).map(step => step.id) : [options.document.steps[0]?.id ?? '']
  const initial = requestedPath.map(id => options.document.steps.find(step => step.id === id)!).find(step => step.kind === 'button' && step !== requested) ?? options.document.steps.find(step => step.id === requestedPath.at(-1))
  let path = requestedPath.slice(0, requestedPath.indexOf(initial?.id ?? '') + 1)
  if (!initial) throw new Error('A guide requires at least one step')
  const state = shallowRef<GuideRuntimeState>({ step: initial, status: 'unavailable' })
  let observer: MutationObserver | null = null
  let target: HTMLElement | undefined
  let targetBounds: DOMRect | null = null
  let modalHost: HTMLElement | null = null
  let modalDialog: HTMLElement | null = null
  let modalPlacement: 'right' | 'left' | 'inline' | null = null
  let savedOverflow: Array<{ property: string; value: string; priority: string }> = []
  let modalResizeObserver: ResizeObserver | null = null
  let destroyed = false
  let announcedPresentation = ''
  let rebuilding = false
  let editedControls = new WeakSet<Element>()
  let pendingBlur: { control: HTMLInputElement | HTMLTextAreaElement; stepId: string } | null = null
  const completedButtons = new Set<string>()
  let modalWorkflow: { stepId: string; dialog: HTMLElement } | null = null
  let targetDialog: HTMLElement | null = null
  let observedDialog: HTMLElement | null = null
  let deferredDialog: HTMLElement | null = null
  let automaticFocusStepId: string | null = null
  let revisitedStepId: string | null = null
  const definition = (step: GuideStep) => options.ledger?.views.find(view => view.key === step.view)?.targets.find(candidate => candidate.key === step.target)
  const stepTarget = (step: GuideStep): GuideTargetRef => definition(step)?.scope === 'instance' && observedContext.kind === 'task'
    ? { kind: 'instance', key: step.target, instance: observedContext.taskId }
    : { kind: 'unique', key: step.target }
  const actionKey = (source: GuideActionSource) => guideActionKey(source.action === 'modal-open' && (source.context.kind === 'owner' || source.context.kind === 'task') ? { ...source, context: { ...source.context, draftRevision: 0 } } : source)
  /** Read the ledger’s completion requirement against this visit’s evidence.
   * @param step Published instruction being checked.
   * @returns Whether its declared action or loaded location is proven.
   */
  const proven = (step: GuideStep) => {
    const rule = definition(step)?.completion
    if (!rule) return completedButtons.has(step.id)
    if (rule.kind === 'location') return (observedContext.kind === 'owner' || observedContext.kind === 'task') && observedContext.facts.includes(rule.fact)
    return receipts.has(actionKey({ target: stepTarget(step), action: rule.action, context: observedContext }))
  }
  const isBlocked = (step: GuideStep) => observedContext.kind === 'pending' || Boolean(presentation) || ((Boolean(definition(step)?.completion) || step.kind === 'button') && !proven(step))
  /** Read a known structured value from the active view, never authored code.
   * @param key Stable target reference.
   * @param view Required view for the condition.
   * @returns Typed value, or undefined when unavailable.
   */
  const readValue = (key: string, view: string): GuideTargetValue => {
    if (view !== currentView) return undefined
    const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-help-target]')).filter(element => element.dataset.helpTarget === key)
    if (matches.length !== 1 || !isVisible(matches[0]!)) return undefined
    return options.readTargetValue ? options.readTargetValue(key) : readGuideTargetValue(root, key)
  }
  /** Evaluate all conditions before choosing a deterministic outgoing edge.
   * @param step Node being left.
   * @returns Availability and the selected successor, if nonterminal.
   */
  const nextDecision = (step: GuideStep): { available: boolean; next: GuideStep | undefined } => {
    if (!step.flow) return { available: true, next: options.document.steps[options.document.steps.indexOf(step) + 1] }
    const values = new Map<string, GuideTargetValue>()
    for (const branch of step.flow.branches) {
      const value = readValue(branch.target, step.view)
      if (value === undefined || (value !== null && value !== '' && typeof value !== typeof branch.equals)) return { available: false, next: undefined }
      values.set(branch.target, value)
    }
    const matched = step.flow.branches.find(branch => values.get(branch.target) === branch.equals)
    const destination = matched ? matched.next : step.flow.next
    return { available: true, next: destination === null ? undefined : options.document.steps.find(candidate => candidate.id === destination) }
  }
  /** Follow evaluated edges without bypassing unfinished actions or alternate routes.
   * @param step Requested destination.
   * @returns Its actual visited path when selectable.
   */
  const selectionPath = (step: GuideStep): string[] | null => {
    const visited = path.indexOf(step.id)
    if (visited >= 0) return path.slice(0, visited + 1)
    const candidatePath = [...path]
    let candidate = state.value.step
    for (let count = 0; count < options.document.steps.length; count++) {
      if (isBlocked(candidate)) return null
      const decision = nextDecision(candidate)
      if (!decision.available || !decision.next || candidatePath.includes(decision.next.id)) return null
      candidate = decision.next
      candidatePath.push(candidate.id)
      if (candidate === step) return candidatePath
    }
    return null
  }
  const canSelect = (step: GuideStep) => selectionPath(step) !== null
  const anchorOnly = () => !presentation && state.value.step.appearance === 'anchor-only'
  let borderObserver: MutationObserver | null = null
  let spotlightBorder: SVGGElement | null = null
  /** Dispose the decorative copy before Driver releases its authoritative stage. */
  const releaseSpotlightBorder = () => {
    borderObserver?.disconnect()
    borderObserver = null
    spotlightBorder?.remove()
    spotlightBorder = null
  }
  /** Copy Driver's rounded inner stage, never its outer viewport polygon.
   * @param overlay The native overlay owned by this reader.
   */
  const mountSpotlightBorder = (overlay: SVGElement) => {
    releaseSpotlightBorder()
    if (anchorOnly() || !target) return
    const nativePath = overlay.querySelector('path')
    if (!nativePath) return
    const border = window.document.createElementNS('http://www.w3.org/2000/svg', 'path')
    border.classList.add('gcs-guide-spotlight-border')
    border.setAttribute('aria-hidden', 'true')
    const outline = window.document.createElementNS('http://www.w3.org/2000/svg', 'g')
    outline.setAttribute('aria-hidden', 'true')
    const segments = Array.from({ length: 64 }, (_, index) => {
      const segment = window.document.createElementNS('http://www.w3.org/2000/svg', 'path')
      segment.classList.add('gcs-guide-spotlight-trail')
      // Nested dashes build a seamless fade, reaching full opacity at the tip.
      segment.style.strokeOpacity = String(1 / (64 - index))
      return segment
    })
    outline.append(border, ...segments)
    overlay.append(outline)
    spotlightBorder = outline
    /** Refresh only the decorative inner contour from native geometry. */
    const sync = () => {
      // Driver's overlay is one closed viewport polygon followed by its rounded hole.
      const hole = /^M[^zZ]+Z\s*(M[^zZ]+z)\s*$/u.exec(nativePath.getAttribute('d') ?? '')?.[1]
      for (const contour of [border, ...segments]) {
        if (hole) contour.setAttribute('d', hole)
        else contour.removeAttribute('d')
      }
      if (!hole) return
      const perimeter = border.getTotalLength()
      if (perimeter <= 0) return
      const segmentLength = perimeter / 4 / segments.length
      outline.style.setProperty('--gcs-guide-lap', `${perimeter / 240}s`)
      segments.forEach((segment, index) => {
        const offset = -index * segmentLength
        const dashLength = segmentLength * (segments.length - index)
        segment.setAttribute('stroke-dasharray', `${dashLength} ${perimeter - dashLength}`)
        segment.style.setProperty('--gcs-guide-start', String(offset))
        // Driver's inner contour runs clockwise; negative dash offsets follow it.
        segment.style.setProperty('--gcs-guide-end', String(offset - perimeter))
      })
    }
    sync()
    borderObserver = new MutationObserver(sync)
    borderObserver.observe(nativePath, { attributes: true, attributeFilter: ['d'] })
  }
  const spotlight = driver({ animate: false, allowKeyboardControl: false, disableActiveInteraction: false, allowClose: false, overlayClickBehavior: 'none', overlayOpacity: 0.45, popoverClass: 'gcs-guide-popover', /** Keep portalled business controls interactive. */
    onHighlighted: () => {
      window.document.querySelectorAll<SVGElement>('.driver-overlay').forEach(overlay => {
        overlay.style.pointerEvents = 'none'
        overlay.style.display = anchorOnly() ? 'none' : ''
        mountSpotlightBorder(overlay)
        // The spotlight and popover must share the dialog's stacking context.
        if (modalHost && overlay.parentElement !== modalHost) modalHost.prepend(overlay)
      })
      if (anchorOnly()) {
        target?.classList.remove('driver-active-element')
        window.document.querySelectorAll('.driver-active-element-parent-no-scroll').forEach(element => element.classList.remove('driver-active-element-parent-no-scroll'))
      }
    } })
  const labels = () => locale === 'fr'
    ? { previous: 'Précédent', next: 'Suivant', exit: 'Quitter', retry: 'Réessayer', wrongView: 'Suivez les instructions pour ouvrir cet écran.', conditionUnavailable: 'Une commande nécessaire à la décision est indisponible. Ouvrez cet écran, puis réessayez.', unavailable: 'Cette commande est indisponible. Suivez les instructions, puis réessayez.', of: 'sur', steps: 'Étapes' }
    : { previous: 'Previous', next: 'Next', exit: 'Exit', retry: 'Retry', wrongView: 'Follow the instructions to open this screen.', conditionUnavailable: 'A control needed for this decision is unavailable. Open that screen, then retry.', unavailable: 'This control is unavailable. Follow the instructions, then retry.', of: 'of', steps: 'Steps' }
  /** Reject controls hidden by their own or ancestor presentation.
   * @param element Candidate control.
   * @param ignoreAriaHidden Open dropdowns may temporarily aria-hide their still-open owning dialog.
   * @returns Whether the control and its ancestors are visible.
   */
  const isVisible = (element: HTMLElement, ignoreAriaHidden = false) => {
    let ancestor: HTMLElement | null = element
    while (ancestor) {
      if (ancestor.hidden || (!ignoreAriaHidden && ancestor.getAttribute('aria-hidden') === 'true') || getComputedStyle(ancestor).display === 'none' || getComputedStyle(ancestor).visibility === 'hidden') return false
      ancestor = ancestor.parentElement
    }
    return true
  }
  /** Resolve a unique currently visible target.
   * @returns The eligible control, if available.
   */
  const resolveTarget = () => {
    if (suspended || observedContext.kind === 'pending' || (presentation?.view ?? state.value.step.view) !== currentView) return undefined
    const reference = presentation ? presentation.target : stepTarget(state.value.step)
    const references = Array.isArray(reference) ? reference : reference ? [reference] : []
    for (const ref of references) {
      const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-help-target]')).filter(element => {
        if (element.dataset.helpTarget !== ref.key || (ref.kind === 'instance' && element.dataset.helpInstance !== ref.instance) || !isVisible(element)) return false
        const contextRoot = element.closest<HTMLElement>('[data-help-context]')
        if (!contextRoot) return ref.kind === 'unique'
        if (observedContext.kind === 'elsewhere' || observedContext.kind === 'pending') return ref.kind === 'unique'
        const loaded = readElementContext(contextRoot)
        if (!loaded || (loaded.kind !== 'owner' && loaded.kind !== 'task')) return false
        const loadedBinding = loaded.kind === 'owner' ? loaded.binding : loaded.execution.binding
        const observedBinding = observedContext.kind === 'owner' ? observedContext.binding : observedContext.execution.binding
        const matchingBinding = loadedBinding?.resourceType === observedBinding?.resourceType && loadedBinding?.resourceId === observedBinding?.resourceId
        const matchingExecution = !loaded.execution || !observedContext.execution || loaded.execution.executionId === observedContext.execution.executionId
        return matchingBinding && matchingExecution
          && (Boolean(presentation) || observedContext.kind !== 'task' || (loaded.kind === 'task' && loaded.taskId === observedContext.taskId))
      })
      if (matches.length > 1) return undefined
      if (matches.length === 1) return matches[0]
    }
    return undefined
  }
  /** Choose a side gutter or an in-dialog flow layout on narrow screens.
   * @param dialog Active business modal.
   * @returns Placement and available popover width.
   */
  const modalLayout = (dialog: HTMLElement) => {
    const bounds = dialog.getBoundingClientRect()
    const right = window.innerWidth - bounds.right - 24
    const left = bounds.left - 24
    if (right >= 280) return { side: 'right' as const, width: Math.min(400, right) }
    if (left >= 280) return { side: 'left' as const, width: Math.min(400, left) }
    return { side: 'inline' as const, width: 0 }
  }
  /** Fit the native popover into a side gutter or the space beside its target.
   * @param element Highlighted application control or section.
   * @param step Current authored instruction.
   * @returns Driver placement and readable dimensions.
   */
  const pageLayout = (element: HTMLElement, step: GuideStep): { side?: Side; align?: Alignment; width?: number; maxHeight?: number } => {
    const bounds = element.getBoundingClientRect()
    const clearance = (spotlight.getConfig().stagePadding ?? 10) + 10 + 12
    const left = bounds.left - clearance
    const right = window.innerWidth - bounds.right - clearance
    if (step.kind === 'section' && left >= 256) return { side: 'left', align: 'start', width: Math.min(400, left) }
    if (step.kind === 'section' && right >= 256) return { side: 'right', align: 'start', width: Math.min(400, right) }
    if (left >= 400 || right >= 400) return {}
    const below = window.innerHeight - bounds.bottom - clearance
    const above = bounds.top - clearance
    const side = below >= 256 || below >= above ? 'bottom' : 'top'
    return { side, align: 'start', maxHeight: Math.min(window.innerHeight - 24, Math.max(256, Math.min(512, side === 'bottom' ? below : above))) }
  }
  /** Offset the popover past the whole dialog, including for narrow switches.
   * @param dialog Business modal bounds owner.
   * @param side Available side gutter or inline placement.
   * @returns Driver offset excluding its existing spotlight padding.
   */
  const modalPopoverOffset = (dialog: HTMLElement, side: 'right' | 'left' | 'inline') => {
    if (!target || side === 'inline') return 10
    const bounds = dialog.getBoundingClientRect()
    const control = target.getBoundingClientRect()
    const distance = side === 'right' ? bounds.right - control.right : control.left - bounds.left
    return Math.max(0, distance) + 12 - (spotlight.getConfig().stagePadding ?? 10)
  }
  /** Keep viewport coordinates aligned as a responsive dialog moves or resizes. */
  const positionModalHost = () => {
    if (!modalHost || !modalDialog) return
    const layout = modalLayout(modalDialog)
    if (modalPlacement && layout.side !== modalPlacement) {
      retry()
      return
    }
    const popover = modalDialog.querySelector<HTMLElement>('.gcs-guide-popover')
    if (popover && layout.side !== 'inline') {
      popover.style.width = `${layout.width}px`
      popover.style.maxWidth = `${layout.width}px`
    }
    spotlight.setConfig({ ...spotlight.getConfig(), popoverOffset: modalPopoverOffset(modalDialog, layout.side) })
    const bounds = modalDialog.getBoundingClientRect()
    modalHost.style.transform = `translate(${-bounds.left}px, ${-bounds.top}px)`
    spotlight.refresh()
  }
  /** Restore only the inline clipping properties temporarily owned by guidance. */
  const releaseModalHost = () => {
    modalResizeObserver?.disconnect()
    modalResizeObserver = null
    modalDialog?.removeEventListener('transitionend', positionModalHost)
    if (modalDialog) {
      for (const property of ['overflow', 'overflow-x', 'overflow-y']) modalDialog.style.removeProperty(property)
      for (const saved of savedOverflow) {
        if (saved.value) modalDialog.style.setProperty(saved.property, saved.value, saved.priority)
      }
    }
    savedOverflow = []
    modalHost?.remove()
    modalHost = null
    modalDialog = null
    modalPlacement = null
  }
  /** Release the spotlight, modal host and target observer. */
  const destroy = () => {
    destroyed = true
    observer?.disconnect()
    spotlight.getActiveElement()?.classList.add('driver-active-element')
    releaseSpotlightBorder()
    spotlight.destroy()
    releaseModalHost()
    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('keydown', onTab)
    releaseChannel?.()
    releaseChannel = null
    receipts.clear()
    window.document.removeEventListener('input', onInput, true)
    window.document.removeEventListener('change', onChange, true)
    window.document.removeEventListener('focusout', onFocusout, true)
    window.document.removeEventListener('focusin', onFocusin, true)
    pendingBlur = null
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll, true)
  }
  const exit = () => {
    destroy()
    options.onExit?.()
  }
  /** Advance only after explicit navigation or verified completion.
   * @param completed Whether a business action completed the current step.
   */
  const advance = (completed = false) => {
    if (suspended || isBlocked(state.value.step)) return
    const decision = nextDecision(state.value.step)
    if (!decision.available) {
      retry()
      return
    }
    const next = decision.next
    if (next) {
      automaticFocusStepId = completed ? next.id : null
      select(next.id)
    } else if (finishDisabled) return
    else if (options.onFinish) options.onFinish()
    else exit()
  }
  /** Exit guidance before a business modal receives Escape.
   * @param event Captured keyboard event.
   */
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || destroyed || defersToBusinessDialog()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    exit()
  }
  const completionEnabled = () => !destroyed && !suspended && !presentation && !defersToBusinessDialog() && observedContext.kind !== 'pending' && state.value.step.advanceOn !== 'manual'
  /**
   * Accept only the operation captured by this reader and this loaded page.
   * @param signal Trusted application operation captured before business work.
   */
  const onSignal = (signal: GuideActionSignal) => {
    if (destroyed) return
    if (signal.kind !== 'succeeded') {
      options.onSignal?.(signal)
      return
    }
    const source = signal.source
    if (source.action === 'save-success' && !options.ledger && (source.target.key !== state.value.step.target || !resolveTarget())) return
    const current = observedContext.kind === 'pending' ? lastLoadedContext : observedContext
    const normalize = (context: GuideObservedContext) => source.action === 'modal-open' && (context.kind === 'owner' || context.kind === 'task') ? { ...context, draftRevision: 0 } : context
    if (!guideContextIdentity(source.context) || guideContextIdentity(normalize(source.context)) !== guideContextIdentity(normalize(current))) return
    receipts.set(actionKey(source), source)
    if (source.action === 'save-success' && options.document.steps.some(step => guideTargetIdentity(stepTarget(step)) === guideTargetIdentity(source.target))) modalWorkflow = null
    const step = state.value.step
    if (guideTargetIdentity(source.target) === guideTargetIdentity(stepTarget(step))) {
      const completion = definition(step)?.completion
      if (completion?.kind === 'success' && completion.action === source.action) revisitedStepId = null
      if (source.action === 'field-change') {
        if (completionEnabled() && ['select', 'checkbox'].includes(step.kind) && readValue(step.target, step.view) !== undefined) advance(true)
        else retry()
        return
      }
      if (step.kind === 'button') completedButtons.add(step.id)
      if (source.action === 'modal-open') {
        const dialog = window.document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], dialog[open]')
        if (dialog) modalWorkflow = { stepId: step.id, dialog }
      } else if (source.action === 'save-success') modalWorkflow = null
      if (completionEnabled() && !definition(step)?.completion) advance(true)
    }
    reconcileCompletion()
  }
  /** Resolve an editable field within the current target.
   * @param event Captured field event.
   * @returns Matching input or textarea.
   */
  const fieldControl = (event: Event) => {
    const control = event.target
    if (!completionEnabled() || !['text', 'textarea', 'number', 'money', 'date'].includes(state.value.step.kind)) return
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) || !target?.contains(control)) return
    if (state.value.step.kind === 'date' && (!(control instanceof HTMLInputElement) || !['date', 'datetime-local'].includes(control.type))) return
    return control
  }
  const onInput = (event: Event) => {
    const control = fieldControl(event)
    if (control) editedControls.add(control)
  }
  /** Complete only an explicitly changed native structured control.
   * @param event Business control change.
   */
  const onChange = (event: Event) => {
    if (rebuilding || destroyed || !target?.contains(event.target as Node)) return
    const control = event.target
    const ariaSelector = '[role="switch"],[role="checkbox"],[role="combobox"]'
    const ariaControl = target.matches(ariaSelector) ? target : target.querySelector<HTMLElement>(ariaSelector)
    // Composite controls own their model-update timing; their host emits the
    // trusted completion event after its accessible value has settled.
    if (ariaControl && !(ariaControl instanceof HTMLInputElement || ariaControl instanceof HTMLSelectElement)) return
    if (control instanceof HTMLElement && (!isVisible(control) || control.closest('[data-hidden]'))) return
    const nativeSelect = state.value.step.kind === 'select' && control instanceof HTMLSelectElement && !control.multiple && !!control.value
    const nativeCheckbox = state.value.step.kind === 'checkbox' && control instanceof HTMLInputElement && control.type === 'checkbox' && !control.indeterminate
    const structured = nativeSelect || nativeCheckbox
    if (!structured || !(control instanceof HTMLSelectElement || control instanceof HTMLInputElement) || !control.validity.valid || control.getAttribute('aria-invalid') === 'true' || target.getAttribute('aria-invalid') === 'true') return
    if (completionEnabled()) advance(true)
    else retry()
  }
  /** Complete a departed field when asynchronous schema validity settles.
   * @param departing Whether currently handling its focusout event.
   * @returns Whether completion advanced the guide.
   */
  const completePendingBlur = (departing = false) => {
    if (!pendingBlur) return false
    const { control, stepId } = pendingBlur
    if (!completionEnabled() || state.value.step.id !== stepId || !control.isConnected || !target?.contains(control) || (!departing && window.document.activeElement === control)) {
      pendingBlur = null
      return false
    }
    if (!editedControls.has(control) || !control.value.trim() || !control.validity.valid || control.getAttribute('aria-invalid') === 'true' || target.getAttribute('aria-invalid') === 'true') return false
    pendingBlur = null
    advance(true)
    return true
  }
  const onFocusin = (event: Event) => {
    if (pendingBlur?.control === event.target) pendingBlur = null
    if (!rebuilding && event.target instanceof HTMLElement && !event.target.closest('.gcs-guide-popover')) automaticFocusStepId = null
  }
  /** Complete an edited field after successful validation and departure.
   * @param event Captured focus departure.
   */
  const onFocusout = (event: Event) => {
    if (rebuilding) return
    const control = fieldControl(event)
    if (!control || !editedControls.has(control)) return
    pendingBlur = { control, stepId: state.value.step.id }
    completePendingBlur(true)
  }
  /** Find the foremost native dialog without treating Driver as business UI.
   * @returns The current application dialog, if any.
   */
  const openBusinessDialog = (): HTMLElement | null => [...window.document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], dialog[open]')]
    .filter(dialog => !dialog.closest('.gcs-guide-popover') && isVisible(dialog, true)).at(-1) ?? null
  /** Keep a known owning dialog through lazy target rendering, never borrow another dialog.
   * @param element Currently resolved native target.
   * @returns Its loaded modal owner while that owner remains open.
   */
  const owningDialog = (element: HTMLElement | undefined) => {
    if (element) targetDialog = element.closest<HTMLElement>('[role="dialog"], dialog[open]')
    if (targetDialog && (!targetDialog.isConnected || targetDialog.dataset.state === 'closed' || !isVisible(targetDialog, true))) targetDialog = null
    return targetDialog ?? modalWorkflow?.dialog ?? null
  }
  /** @returns Whether an unrelated native dialog currently owns interaction. */
  const defersToBusinessDialog = () => {
    const dialog = openBusinessDialog()
    return Boolean(dialog && dialog !== owningDialog(resolveTarget()))
  }
  /** Refresh existing geometry without rebuilding, focusing, or scrolling a native control. */
  const refreshPageGeometry = () => {
    if (destroyed || !target || deferredDialog) return
    if (!suspended && state.value.status === 'ready' && target.isConnected && spotlight.getActiveElement() === target && !anchorOnly() && !target.classList.contains('driver-active-element')) target.classList.add('driver-active-element')
    if (modalDialog) return
    const bounds = target.getBoundingClientRect()
    if (targetBounds && bounds.x === targetBounds.x && bounds.y === targetBounds.y && bounds.width === targetBounds.width && bounds.height === targetBounds.height) return
    targetBounds = bounds
    const layout = pageLayout(target, state.value.step)
    const activeStep = spotlight.getActiveStep()
    if (activeStep?.popover) {
      activeStep.popover.side = layout.side
      activeStep.popover.align = layout.align
    }
    const popover = spotlight.getState().popover?.wrapper
    if (popover) {
      popover.style.width = layout.width ? `${layout.width}px` : ''
      popover.style.maxWidth = layout.width ? `${layout.width}px` : ''
      popover.style.maxHeight = layout.maxHeight ? `${layout.maxHeight}px` : ''
    }
    spotlight.refresh()
  }
  /** Capture nested overflow scrolling, which does not bubble to Driver's window listener. */
  const onScroll = () => {
    if (modalDialog) positionModalHost()
    else refreshPageGeometry()
  }
  /** Observe availability and native dialog lifetimes while guidance is deferred. */
  const observeTargets = () => {
    observer ??= new MutationObserver(records => {
      if (destroyed) return
      if (records.some(record => record.attributeName === 'aria-invalid') && completePendingBlur()) return
      if (modalWorkflow && (!modalWorkflow.dialog.isConnected || modalWorkflow.dialog.dataset.state === 'closed' || !isVisible(modalWorkflow.dialog, true))) {
        const origin = modalWorkflow.stepId
        receipts.clear()
        const originIndex = options.document.steps.findIndex(step => step.id === origin)
        for (const step of options.document.steps.slice(originIndex)) completedButtons.delete(step.id)
        modalWorkflow = null
        select(origin)
        return
      }
      if (openBusinessDialog() !== observedDialog) {
        retry()
        if (!deferredDialog) reconcileCompletion()
        return
      }
      const next = resolveTarget()
      const nextStatus = (presentation?.view ?? state.value.step.view) !== currentView ? 'wrong-view' : next ? 'ready' : 'unavailable'
      if (next !== target || nextStatus !== state.value.status || records.some(record => ['aria-checked', 'data-help-value'].includes(record.attributeName ?? ''))) retry()
      else refreshPageGeometry()
    })
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-help-context', 'data-help-instance', 'hidden', 'aria-hidden', 'data-state', 'aria-invalid', 'aria-checked', 'data-help-value', 'class', 'style'] })
  }
  /** Rebuild the selected popover against the current visible controls. */
  const retry = () => {
    if (destroyed) return
    const activeElement = window.document.activeElement
    const focusedControl = activeElement instanceof HTMLElement && (target?.contains(activeElement) || (!spotlight.getState().popover?.wrapper.contains(activeElement) && activeElement.matches('input,textarea,select,[contenteditable="true"]'))) ? activeElement : null
    rebuilding = true
    observer?.disconnect()
    spotlight.getActiveElement()?.classList.add('driver-active-element')
    releaseSpotlightBorder()
    spotlight.destroy()
    releaseModalHost()
    const step = state.value.step
    target = resolveTarget()
    const status = (presentation?.view ?? step.view) !== currentView ? 'wrong-view' : target ? 'ready' : 'unavailable'
    state.value = { step, status }
    const index = options.document.steps.indexOf(step)
    const text = labels()
    const decision = nextDecision(step)
    observedDialog = openBusinessDialog()
    const dialog = owningDialog(target)
    deferredDialog = observedDialog && observedDialog !== dialog ? observedDialog : null
    if (deferredDialog) {
      rebuilding = false
      observeTargets()
      return
    }
    let restoreFocus = !suspended && status === 'ready' && focusedControl?.isConnected && isVisible(focusedControl) && (!observedDialog || observedDialog.contains(focusedControl)) ? focusedControl : null
    let scrollBlock: ScrollLogicalPosition = 'nearest'
    if (automaticFocusStepId === step.id && target && !presentation) {
      const control = target.matches('input,textarea,select,button,a[href]')
        ? target
        : target.querySelector<HTMLElement>('[data-help-kind="button"]') ?? target.querySelector<HTMLElement>('input,textarea,select,button,a[href]')
      if (control) {
        automaticFocusStepId = null
        restoreFocus = control
        scrollBlock = dialog ? 'nearest' : 'start'
      }
    }
    restoreFocus?.scrollIntoView?.({ block: scrollBlock, inline: 'nearest' })
    if (!dialog && target) {
      const bounds = target.getBoundingClientRect()
      if (bounds.top < 0 || bounds.left < 0 || bounds.bottom > window.innerHeight || bounds.right > window.innerWidth) {
        // Driver scrolls offscreen targets before rendering. Settle that scroll
        // before measuring the native popover's available space.
        target.scrollIntoView?.({ behavior: 'instant', inline: 'center', block: target.offsetHeight > window.innerHeight ? 'start' : 'center' })
      }
    }
    const layout = dialog ? modalLayout(dialog) : null
    const normalLayout = !dialog && target ? pageLayout(target, step) : null
    const instructions = presentation ? renderSafeMarkdown(presentation.instructions[locale]) : suspended ? '' : renderSafeMarkdown(step.instructions[locale])
    spotlight.setConfig({ ...spotlight.getConfig(), overlayOpacity: anchorOnly() ? 0 : 0.45, popoverOffset: dialog && layout ? modalPopoverOffset(dialog, layout.side) : 10 })
    spotlight.highlight({ element: target, popover: {
      // Driver accepts HTML: all authored strings pass through the safe renderer.
      title: renderSafeMarkdown(presentation?.title[locale] ?? (suspended ? options.document.title[locale] : step.title[locale])),
      description: instructions,
      side: layout?.side === 'inline' ? 'bottom' : layout?.side ?? normalLayout?.side,
      align: normalLayout?.align,
      showButtons: ['previous', 'next', 'close'],
      disableButtons: [...(suspended || presentation || path.length === 1 ? ['previous' as const] : []), ...(suspended || isBlocked(step) || !decision.available || (!decision.next && finishDisabled) ? ['next' as const] : [])],
      prevBtnText: text.previous,
      nextBtnText: decision.available && !decision.next ? finishLabel ?? text.exit : text.next,
      closeBtnLabel: text.exit,
      showProgress: true,
      progressText: `${index + 1} ${text.of} ${options.document.steps.length}`,
      onPrevClick: () => {
        const previous = options.document.steps.find(candidate => candidate.id === path.at(-2))
        if (previous && state.value.step === step) select(previous.id)
      },
      onNextClick: () => {
        if (state.value.step === step) advance()
      },
      onCloseClick: exit,
      /** Add trusted controls and keep modal guidance within its focus boundary.
       * @param popover Driver-owned popover elements.
       */
      onPopoverRender: popover => {
        popover.wrapper.lang = locale
        popover.wrapper.classList.toggle('gcs-guide-anchor-only', anchorOnly())
        popover.wrapper.style.display = 'flex'
        popover.description.style.display = 'block'
        if (!instructions) popover.description.replaceChildren()
        if (normalLayout?.width) {
          popover.wrapper.style.width = `${normalLayout.width}px`
          popover.wrapper.style.maxWidth = `${normalLayout.width}px`
        }
        if (normalLayout?.maxHeight) popover.wrapper.style.maxHeight = `${normalLayout.maxHeight}px`
        const announcement = presentation ? JSON.stringify([locale, presentation.title, presentation.instructions, presentation.target]) : ''
        if (announcement && announcement !== announcedPresentation) {
          popover.description.setAttribute('role', 'status')
          popover.description.setAttribute('aria-live', 'polite')
        }
        announcedPresentation = announcement
        if (context && !suspended) {
          const orientation = window.document.createElement('p')
          orientation.className = 'gcs-guide-status'
          orientation.textContent = context
          popover.description.prepend(orientation)
        }
        if (statusMessage) {
          const status = window.document.createElement('p')
          status.className = 'gcs-guide-status'
          status.setAttribute('role', 'status')
          status.textContent = statusMessage
          popover.description.appendChild(status)
        }
        const chooserLabel = window.document.createElement('label')
        chooserLabel.className = 'gcs-guide-step-label'
        chooserLabel.textContent = text.steps
        const chooser = window.document.createElement('select')
        chooser.className = 'gcs-guide-step-select'
        for (const [stepIndex, candidate] of options.document.steps.entries()) {
          const option = window.document.createElement('option')
          option.value = candidate.id
          option.textContent = `${stepIndex + 1}. ${candidate.title[locale]}`
          option.selected = candidate.id === step.id
          option.disabled = !canSelect(candidate)
          chooser.appendChild(option)
        }
        chooser.addEventListener('change', () => {
          if (state.value.step === step) select(chooser.value)
        })
        chooserLabel.appendChild(chooser)
        if (!suspended && !presentation) popover.description.after(chooserLabel)
        if (notice) {
          const warning = window.document.createElement('p')
          warning.className = 'gcs-guide-status'
          warning.textContent = notice
          popover.description.prepend(warning)
        }
        if (!suspended && (status !== 'ready' || !decision.available)) {
          const notice = window.document.createElement('p')
          notice.className = 'gcs-guide-status'
          notice.textContent = !decision.available ? text.conditionUnavailable : status === 'wrong-view' ? text.wrongView : text.unavailable
          popover.description.appendChild(notice)
          if (status === 'unavailable' || !decision.available) {
            const button = window.document.createElement('button')
            button.type = 'button'
            button.className = 'gcs-guide-retry'
            button.textContent = text.retry
            button.addEventListener('click', retry)
            popover.description.appendChild(button)
          }
        }
        // Reka modal focus guards require controls inside its dialog subtree.
        // A viewport-sized host preserves Driver's viewport-based positioning.
        if (dialog) {
          modalDialog = dialog
          modalPlacement = layout!.side
          if (layout!.side === 'inline') popover.wrapper.classList.add('gcs-guide-modal-inline')
          else {
            popover.wrapper.style.width = `${layout!.width}px`
            popover.wrapper.style.maxWidth = `${layout!.width}px`
          }
          savedOverflow = ['overflow', 'overflow-x', 'overflow-y'].map(property => ({ property, value: dialog.style.getPropertyValue(property), priority: dialog.style.getPropertyPriority(property) }))
          // The dialog normally clips its rounded content. Guidance may extend
          // beyond its bounds, while remaining inside the modal focus boundary.
          dialog.style.setProperty('overflow', 'visible', 'important')
          modalHost = window.document.createElement('div')
          modalHost.className = 'gcs-guide-modal-host'
          dialog.appendChild(modalHost)
          if (layout!.side === 'inline') dialog.appendChild(popover.wrapper)
          else modalHost.appendChild(popover.wrapper)
          positionModalHost()
          dialog.addEventListener('transitionend', positionModalHost)
          if (typeof ResizeObserver !== 'undefined') {
            modalResizeObserver = new ResizeObserver(positionModalHost)
            modalResizeObserver.observe(dialog)
          }
        }
      }
    } })
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true })
    if (layout?.side === 'inline' && restoreFocus?.isConnected && dialog?.contains(restoreFocus) && window.document.activeElement === restoreFocus) restoreFocus.scrollIntoView?.({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
    targetBounds = target?.getBoundingClientRect() ?? null
    rebuilding = false
    observeTargets()
  }
  /** Refresh normal targets while preserving an existing responsive modal host. */
  const onResize = () => {
    if (modalDialog) positionModalHost()
    else retry()
  }
  /** Show the requested step without invoking any business action.
   * @param stepId Stable identity of the requested step.
   */
  const select = (stepId: string) => {
    const step = options.document.steps.find(candidate => candidate.id === stepId)
    if (!step || destroyed || suspended || presentation || observedContext.kind === 'pending') return
    const selectedPath = selectionPath(step)
    if (!selectedPath) return
    if (selectedPath.length < path.length) revisitedStepId = step.id
    else if (step !== state.value.step) revisitedStepId = null
    if (automaticFocusStepId !== stepId) automaticFocusStepId = null
    path = selectedPath
    editedControls = new WeakSet<Element>()
    pendingBlur = null
    state.value = { step, status: 'unavailable' }
    retry()
    options.onSelect?.(stepId, [...path])
    if (revisitedStepId !== step.id && options.ledger && definition(step)?.completion && step.advanceOn !== 'manual' && proven(step)) queueMicrotask(() => reconcileCompletion())
  }
  /** Let native page/dialog Tab handlers run before bypassing Driver's target-only trap.
   * @param event Native keyboard event after page and dialog handlers.
   */
  const onTab = (event: KeyboardEvent) => {
    if (anchorOnly() && !destroyed && !deferredDialog && event.key === 'Tab') event.stopImmediatePropagation()
  }
  /** Catch up only explicitly satisfied ledger gates, stopping at manual reading.
   * @param refresh Whether changed presentation or completion gates require a new popover.
   */
  const reconcileCompletion = (refresh = true) => {
    const originalStep = state.value.step
    if (destroyed || suspended || presentation || defersToBusinessDialog() || observedContext.kind === 'pending') {
      retry()
      return
    }
    const index = options.document.steps.indexOf(state.value.step)
    const unmet = options.document.steps.slice(0, index).find(step => path.includes(step.id) && definition(step)?.completion?.kind === 'success' && !proven(step))
    if (unmet) {
      path = path.slice(0, path.indexOf(unmet.id) + 1)
      if (!path.length) path = options.document.steps.slice(0, options.document.steps.indexOf(unmet) + 1).map(step => step.id)
      state.value = { step: unmet, status: 'unavailable' }
      options.onSelect?.(unmet.id, [...path])
    }
    for (let count = 0; count < options.document.steps.length; count++) {
      const step = state.value.step
      if (revisitedStepId === step.id || step.advanceOn === 'manual' || !definition(step)?.completion || !proven(step)) break
      const decision = nextDecision(step)
      if (!decision.available || !decision.next) {
        if (decision.available && !finishDisabled) advance(true)
        break
      }
      const before = step
      advance(true)
      if (state.value.step === before) break
    }
    if (refresh || originalStep !== state.value.step) retry()
  }
  releaseChannel = options.actionChannel?.attach(onSignal) ?? null
  if (options.actionChannel && !releaseChannel) throw new Error('A guide reader is already active')
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('keydown', onTab)
  window.document.addEventListener('input', onInput, true)
  window.document.addEventListener('change', onChange, true)
  window.document.addEventListener('focusout', onFocusout, true)
  window.document.addEventListener('focusin', onFocusin, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, true)
  if (!suspended && initial !== requested) options.onSelect?.(initial.id, [...path])
  reconcileCompletion()
  return { state, select, retry, destroy,
    /** @returns Actual visited step identities, without field values. */
    get path() {
      return [...path]
    }, /** Refresh guidance after host navigation or language selection.
   * @param nextContext Current application context.
   * @param nextContext.currentView Current stable view key.
   * @param nextContext.locale Active interface language.
   * @param nextContext.notice Optional localized preview warning.
   * @param nextContext.context Optional task orientation.
   * @param nextContext.statusMessage Optional business-state explanation.
   * @param nextContext.finishDisabled Whether the host is awaiting business completion.
   * @param nextContext.finishLabel Optional localized final-instruction action.
   * @param nextContext.suspended Whether the host context forbids task guidance.
   * @param nextContext.observedContext Authorized loaded page identity and facts.
   * @param nextContext.presentation Temporary native navigation or recovery instructions.
   */
    updateContext: (nextContext: { currentView: string; locale: GuideLocale; notice?: string; context?: string; statusMessage?: string; finishDisabled?: boolean; finishLabel?: string; suspended?: boolean; observedContext?: GuideObservedContext; presentation?: GuidePresentation | null }) => {
      const renderKey = () => JSON.stringify([currentView, locale, notice, context, statusMessage, finishDisabled, finishLabel, suspended, presentation, observedContext.kind === 'owner' || observedContext.kind === 'task' ? { ...observedContext, draftRevision: 0 } : observedContext, isBlocked(state.value.step), options.document.steps.map(canSelect)])
      const previousRendering = renderKey()
      currentView = nextContext.currentView
      locale = nextContext.locale
      if ('notice' in nextContext) notice = nextContext.notice
      if ('context' in nextContext) context = nextContext.context
      if ('statusMessage' in nextContext) statusMessage = nextContext.statusMessage
      if ('finishDisabled' in nextContext) finishDisabled = nextContext.finishDisabled
      if ('finishLabel' in nextContext) finishLabel = nextContext.finishLabel
      if ('suspended' in nextContext) suspended = nextContext.suspended
      if ('observedContext' in nextContext && nextContext.observedContext) {
        observedContext = nextContext.observedContext
        if (observedContext.kind === 'owner' || observedContext.kind === 'task') {
          for (const [key, receipt] of receipts) {
            const normalize = (context: GuideObservedContext) => receipt.action === 'modal-open' && (context.kind === 'owner' || context.kind === 'task') ? { ...context, draftRevision: 0 } : context
            if (guideContextIdentity(normalize(receipt.context)) !== guideContextIdentity(normalize(observedContext))) receipts.delete(key)
          }
          if (guideContextIdentity({ ...observedContext, draftRevision: 0 }) !== guideContextIdentity(lastLoadedContext.kind === 'owner' || lastLoadedContext.kind === 'task' ? { ...lastLoadedContext, draftRevision: 0 } : lastLoadedContext)) {
            completedButtons.clear()
            revisitedStepId = null
          }
          lastLoadedContext = observedContext
        }
      }
      if ('presentation' in nextContext) presentation = nextContext.presentation
      reconcileCompletion(previousRendering !== renderKey())
    }, /**
   * @returns Active interface language.
   */
    get locale() { return locale } }
}
