import { driver } from 'driver.js'
import { shallowRef } from 'vue'
import { isGuidePath } from './contracts'
import type { GuideDocument, GuideStep } from './contracts'
import { renderSafeMarkdown } from './markdown'

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
  notice?: string
}

/** Read native structured values or explicit accessible checkbox state.
 * @param root Host DOM root.
 * @param key Stable registered target.
 * @returns Typed value; undefined means unavailable, null means unselected.
 */
export const readGuideTargetValue = (root: ParentNode, key: string): GuideTargetValue => {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-help-target]')).filter(element => element.dataset.helpTarget === key)
  if (matches.length !== 1) return undefined
  const element = matches[0]!
  const selector = 'select,input[type="checkbox"],[role="checkbox"],[role="switch"]'
  const controls = element.matches(selector) ? [element] : Array.from(element.querySelectorAll<HTMLElement>(selector))
  if (controls.length !== 1) return undefined
  const control = controls[0]!
  if (!control.isConnected) return undefined
  let ancestor: HTMLElement | null = control
  while (ancestor) {
    if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' || getComputedStyle(ancestor).display === 'none' || getComputedStyle(ancestor).visibility === 'hidden') return undefined
    ancestor = ancestor.parentElement
  }
  if (control instanceof HTMLSelectElement && !control.multiple) return control.value || null
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.indeterminate ? undefined : control.checked
  if (control?.matches('[role="checkbox"],[role="switch"]')) {
    const checked = control.getAttribute('aria-checked')
    return checked === 'true' ? true : checked === 'false' ? false : undefined
  }
  return undefined
}

/** Create optional, non-navigating guidance with an anchored Driver popover.
 * @param options Published snapshot and current application context.
 * @returns Manual controls and observable target availability.
 */
export const createGuideRuntime = (options: GuideRuntimeOptions) => {
  let currentView = options.currentView
  let locale = options.locale
  let notice = options.notice
  const root = options.root ?? window.document
  const requested = options.document.steps.find(step => step.id === options.initialStepId) ?? options.document.steps[0]
  const requestedPath = requested && isGuidePath(options.document, options.initialPath, requested.id) ? options.initialPath : options.document.steps.every(step => !step.flow) ? options.document.steps.slice(0, options.document.steps.indexOf(requested!) + 1).map(step => step.id) : [options.document.steps[0]?.id ?? '']
  const initial = requestedPath.map(id => options.document.steps.find(step => step.id === id)!).find(step => step.kind === 'button' && step !== requested) ?? options.document.steps.find(step => step.id === requestedPath.at(-1))
  let path = requestedPath.slice(0, requestedPath.indexOf(initial?.id ?? '') + 1)
  if (!initial) throw new Error('A guide requires at least one step')
  const state = shallowRef<GuideRuntimeState>({ step: initial, status: 'unavailable' })
  let observer: MutationObserver | null = null
  let target: HTMLElement | undefined
  let modalHost: HTMLElement | null = null
  let modalDialog: HTMLElement | null = null
  let modalPlacement: 'right' | 'left' | 'inline' | null = null
  let savedOverflow: Array<{ property: string; value: string; priority: string }> = []
  let modalResizeObserver: ResizeObserver | null = null
  let destroyed = false
  let rebuilding = false
  let editedControls = new WeakSet<Element>()
  let pendingBlur: { control: HTMLInputElement | HTMLTextAreaElement; stepId: string } | null = null
  const completedButtons = new Set<string>()
  let modalWorkflow: { stepId: string; dialog: HTMLElement } | null = null
  const isBlocked = (step: GuideStep) => step.kind === 'button' && !completedButtons.has(step.id)
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
  const spotlight = driver({ animate: false, allowKeyboardControl: false, disableActiveInteraction: false, allowClose: false, overlayClickBehavior: 'none', overlayOpacity: 0.45, popoverClass: 'gcs-guide-popover', /** Keep portalled business controls interactive. */
    onHighlighted: () => {
      window.document.querySelectorAll<SVGElement>('.driver-overlay').forEach(overlay => {
        overlay.style.pointerEvents = 'none'
        // The spotlight and popover must share the dialog's stacking context.
        if (modalHost && overlay.parentElement !== modalHost) modalHost.prepend(overlay)
      })
    } })
  const labels = () => locale === 'fr'
    ? { previous: 'Précédent', next: 'Suivant', exit: 'Quitter', retry: 'Réessayer', wrongView: 'Suivez les instructions pour ouvrir cet écran.', conditionUnavailable: 'Une commande nécessaire à la décision est indisponible. Ouvrez cet écran, puis réessayez.', unavailable: 'Cette commande est indisponible. Suivez les instructions, puis réessayez.', of: 'sur', steps: 'Étapes' }
    : { previous: 'Previous', next: 'Next', exit: 'Exit', retry: 'Retry', wrongView: 'Follow the instructions to open this screen.', conditionUnavailable: 'A control needed for this decision is unavailable. Open that screen, then retry.', unavailable: 'This control is unavailable. Follow the instructions, then retry.', of: 'of', steps: 'Steps' }
  /** Reject controls hidden by their own or ancestor presentation.
   * @param element Candidate control.
   * @returns Whether the control and its ancestors are visible.
   */
  const isVisible = (element: HTMLElement) => {
    let ancestor: HTMLElement | null = element
    while (ancestor) {
      if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' || getComputedStyle(ancestor).display === 'none' || getComputedStyle(ancestor).visibility === 'hidden') return false
      ancestor = ancestor.parentElement
    }
    return true
  }
  /** Resolve a unique currently visible target.
   * @returns The eligible control, if available.
   */
  const resolveTarget = () => {
    if (state.value.step.view !== currentView) return undefined
    const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-help-target]')).filter(element => element.dataset.helpTarget === state.value.step.target)
    return matches.length === 1 && isVisible(matches[0]!) ? matches[0] : undefined
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
    spotlight.destroy()
    releaseModalHost()
    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('guided-help:completed', onCompleted)
    window.document.removeEventListener('input', onInput, true)
    window.document.removeEventListener('change', onChange, true)
    window.document.removeEventListener('focusout', onFocusout, true)
    window.document.removeEventListener('focusin', onFocusin, true)
    pendingBlur = null
    window.removeEventListener('resize', positionModalHost)
    window.removeEventListener('scroll', positionModalHost, true)
  }
  const exit = () => {
    destroy()
    options.onExit?.()
  }
  /** Advance only after explicit navigation or verified completion.
   * @param completed Whether a business action completed the current step.
   */
  const advance = (completed = false) => {
    if (isBlocked(state.value.step)) return
    const decision = nextDecision(state.value.step)
    if (!decision.available) {
      retry()
      return
    }
    const next = decision.next
    if (next) {
      select(next.id)
      if (completed) {
        const control = target?.matches('input,textarea,select,button,a[href]') ? target : target?.querySelector<HTMLElement>('input,textarea,select,button,a[href]')
        control?.focus({ preventScroll: true })
        control?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      }
    } else exit()
  }
  /** Exit guidance before a business modal receives Escape.
   * @param event Captured keyboard event.
   */
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || destroyed) return
    event.preventDefault()
    event.stopImmediatePropagation()
    exit()
  }
  const completionEnabled = () => !destroyed && state.value.step.advanceOn !== 'manual'
  /** Accept completion only from the matching host business action.
   * @param event Trusted application completion signal.
   */
  const onCompleted = (event: Event) => {
    const detail: unknown = (event as CustomEvent).detail
    if (destroyed || !detail || typeof detail !== 'object') return
    const completion = detail as { target?: unknown; action?: unknown }
    if (completion.target !== state.value.step.target) return
    if (completion.action === 'field-change') {
      if (completionEnabled() && ['select', 'checkbox'].includes(state.value.step.kind) && readValue(state.value.step.target, state.value.step.view) !== undefined) advance(true)
      else retry()
      return
    }
    if (state.value.step.kind !== 'button' || !['modal-open', 'save-success'].includes(String(completion.action))) return
    completedButtons.add(state.value.step.id)
    if (completion.action === 'modal-open') {
      const dialog = window.document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], dialog[open]')
      if (dialog) modalWorkflow = { stepId: state.value.step.id, dialog }
    } else modalWorkflow = null
    if (completionEnabled()) advance(true)
    else retry()
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
  /** Rebuild the selected popover against the current visible controls. */
  const retry = () => {
    if (destroyed) return
    const focusedControl = window.document.activeElement instanceof HTMLElement && target?.contains(window.document.activeElement) ? window.document.activeElement : null
    rebuilding = true
    observer?.disconnect()
    spotlight.destroy()
    releaseModalHost()
    const step = state.value.step
    target = resolveTarget()
    const status = step.view !== currentView ? 'wrong-view' : target ? 'ready' : 'unavailable'
    state.value = { step, status }
    const index = options.document.steps.indexOf(step)
    const text = labels()
    const decision = nextDecision(step)
    const dialog = target?.closest<HTMLElement>('[role="dialog"], dialog[open]') ?? window.document.querySelector<HTMLElement>('[role="dialog"][data-state="open"], dialog[open]')
    const layout = dialog ? modalLayout(dialog) : null
    spotlight.setConfig({ ...spotlight.getConfig(), popoverOffset: dialog && layout ? modalPopoverOffset(dialog, layout.side) : 10 })
    spotlight.highlight({ element: target, popover: {
      // Driver accepts HTML: all authored strings pass through the safe renderer.
      title: renderSafeMarkdown(step.title[locale]),
      description: renderSafeMarkdown(step.instructions[locale]),
      side: layout?.side === 'inline' ? 'bottom' : layout?.side,
      showButtons: ['previous', 'next', 'close'],
      disableButtons: [...(path.length === 1 ? ['previous' as const] : []), ...(isBlocked(step) || !decision.available ? ['next' as const] : [])],
      prevBtnText: text.previous,
      nextBtnText: decision.available && !decision.next ? text.exit : text.next,
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
        popover.description.appendChild(chooserLabel)
        if (notice) {
          const warning = window.document.createElement('p')
          warning.className = 'gcs-guide-status'
          warning.textContent = notice
          popover.description.prepend(warning)
        }
        if (status !== 'ready' || !decision.available) {
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
    observer ??= new MutationObserver(records => {
      if (destroyed) return
      if (records.some(record => record.attributeName === 'aria-invalid') && completePendingBlur()) return
      if (modalWorkflow && (!modalWorkflow.dialog.isConnected || modalWorkflow.dialog.dataset.state === 'closed' || !isVisible(modalWorkflow.dialog))) {
        const origin = modalWorkflow.stepId
        const originIndex = options.document.steps.findIndex(step => step.id === origin)
        for (const step of options.document.steps.slice(originIndex)) completedButtons.delete(step.id)
        modalWorkflow = null
        select(origin)
        return
      }
      const next = resolveTarget()
      const nextStatus = state.value.step.view !== currentView ? 'wrong-view' : next ? 'ready' : 'unavailable'
      if (next !== target || nextStatus !== state.value.status || records.some(record => ['aria-checked', 'data-help-value'].includes(record.attributeName ?? ''))) retry()
    })
    if (focusedControl?.isConnected && target?.contains(focusedControl)) {
      focusedControl.focus({ preventScroll: true })
      focusedControl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    }
    rebuilding = false
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'data-state', 'aria-invalid', 'aria-checked', 'data-help-value', 'class', 'style'] })
  }
  /** Show the requested step without invoking any business action.
   * @param stepId Stable identity of the requested step.
   */
  const select = (stepId: string) => {
    const step = options.document.steps.find(candidate => candidate.id === stepId)
    if (!step || destroyed) return
    const selectedPath = selectionPath(step)
    if (!selectedPath) return
    path = selectedPath
    editedControls = new WeakSet<Element>()
    pendingBlur = null
    state.value = { step, status: 'unavailable' }
    retry()
    options.onSelect?.(stepId, [...path])
  }
  retry()
  if (initial !== requested) options.onSelect?.(initial.id, [...path])
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('guided-help:completed', onCompleted)
  window.document.addEventListener('input', onInput, true)
  window.document.addEventListener('change', onChange, true)
  window.document.addEventListener('focusout', onFocusout, true)
  window.document.addEventListener('focusin', onFocusin, true)
  window.addEventListener('resize', positionModalHost)
  window.addEventListener('scroll', positionModalHost, true)
  return { state, select, retry, destroy,
    /** @returns Actual visited step identities, without field values. */
    get path() {
      return [...path]
    }, /** Refresh guidance after host navigation or language selection.
   * @param context Current application context.
   * @param context.currentView Current stable view key.
   * @param context.locale Active interface language.
   * @param context.notice Optional localized preview warning.
   */
    updateContext: (context: { currentView: string; locale: GuideLocale; notice?: string }) => {
      currentView = context.currentView
      locale = context.locale
      if ('notice' in context) notice = context.notice
      retry()
    }, /**
   * @returns Active interface language.
   */
    get locale() { return locale } }
}
