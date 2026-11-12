<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Host owns discovery and launch
package owns the tour. */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import GuidedHelpJourney from '@gcs-ssc/guided-help/components/GuidedHelpJourney.vue'
import type { GuideJourneyBinding, GuideJourneyCursor, GuideJourneySnapshot, GuideJourneySession } from '@gcs-ssc/guided-help/journey'
import { guidedHelpJourneys, checkHostGuideCompatibility } from '~~/shared/guided-help/journeys'
import { buildGuidedHelpWorkflowRuntime } from '~/utils/guided-help-workflow-runtime'
import type { GuidedHelpWorkflowRuntime } from '~/utils/guided-help-workflow-runtime'
import GuidedHelpPanel from '@gcs-ssc/guided-help/components/GuidedHelpPanel.vue'
import { GuideDocumentSchema } from '@gcs-ssc/guided-help/contracts'
import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'
import { createGuideSession } from '@gcs-ssc/guided-help/session'
import type { GuideSessionSnapshot } from '@gcs-ssc/guided-help/session'
import '@gcs-ssc/guided-help/style.css'
import { useGuidedHelpDiscovery } from '~/composables/useGuidedHelpDiscovery'
import { useGuidedHelpRequestOwner } from '~/composables/useGuidedHelpRequestOwner'
import { helpRequest } from '~/utils/guided-help-client'
import { clearHelpPicker, readHelpPicker, saveHelpPicker } from '~/utils/guided-help-picker'
import { appRouteLocations } from '~/utils/route-locations'
import { GuideObservedContextSchema } from '@gcs-ssc/guided-help/runtime'
import type { GuideActionSignal, GuideObservedContext, GuidePresentation, GuideTargetRef } from '@gcs-ssc/guided-help/runtime'
import { guidedHelpLedger } from '#ui-targets'

const { t, locale } = useI18n()
const { user } = useAuth()
const route = useRouter().currentRoute
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const currentView = ref('')
const viewAgencyId = ref('')
const viewReviewId = ref('')
const viewAgreementId = ref('')
const actionChannel = useGuidedHelpActions()
const observedContext: Ref<GuideObservedContext> = ref({ kind: 'pending' })
const returnTarget: Ref<GuideTargetRef | null> = ref(null)
const routeIdentity = () => JSON.stringify([typeof route.value.name === 'string' ? route.value.name.replace(/___(?:en|fr)$/, '') : '', route.value.params])
let loadedView: { element: HTMLElement; key: string; route: string } | null = null
const journeyRuntime: Ref<GuidedHelpWorkflowRuntime | null> = ref(null)
const journeyRequest = useGuidedHelpRequestOwner<'journey'>()
const selectionRequest = useGuidedHelpRequestOwner<'selection'>()
const discoveryRequest = useGuidedHelpRequestOwner<'discovery' | 'launch'>()
const journeyAuthorized = computed(() => journeyRequest.state.value.kind === 'success')
const journeyLoading = journeyRequest.pending
const journeyFailed = computed(() => journeyRequest.state.value.kind === 'error')
let runtimeBindingId = ''
const loading = computed(() => discoveryRequest.state.value.kind === 'pending' && discoveryRequest.state.value.action === 'launch')
const { items, loading: discoveryLoading, active, requestedGuideId } = useGuidedHelpDiscovery()
const snapshot: Ref<GuideSessionSnapshot | null> = ref(null)
const previewDocument: Ref<GuideDocument | null> = ref(null)
const previewJourney: Ref<GuideJourneySession> = ref({ binding: null, cursor: null })
const previewAgencyId = ref('')
const readerKey = ref(0)
type PickerState = { kind: 'inactive' } | { kind: 'selecting' } | { kind: 'selected' }
const pickerState: Ref<PickerState> = ref({ kind: 'inactive' })
const pickerMessage = computed(() => pickerState.value.kind === 'inactive' ? '' : t(pickerState.value.kind === 'selecting' ? 'guided_help.pick_instructions' : 'guided_help.pick_selected'))
const previewStepId: Ref<string | undefined> = ref(undefined)
const previewPath: Ref<string[] | undefined> = ref(undefined)
let session: ReturnType<typeof createGuideSession> | null = null
let observer: MutationObserver | null = null
const agencyId = computed(() => {
  const agencyRoute = /\/(?:agencies|agences)\/([^/]+)/.exec(route.value.path)
  return viewAgencyId.value || agencyRoute?.[1] || ''
})
const document = computed(() => previewDocument.value ?? snapshot.value?.document ?? null)
const setObservedContext = (context: GuideObservedContext) => {
  if (JSON.stringify(context) !== JSON.stringify(observedContext.value)) observedContext.value = context
}
const setReturnTarget = (target: GuideTargetRef | null) => {
  if (JSON.stringify(target) !== JSON.stringify(returnTarget.value)) returnTarget.value = target
}
watch(() => Boolean(document.value), (value, previous) => {
  active.value = value
  if (!value && previous && user.value?.id) void discover()
}, { immediate: true })
watch(discoveryRequest.pending, value => {
  discoveryLoading.value = value
}, { flush: 'sync' })
const readDeclaredContext = (element: HTMLElement | null | undefined): GuideObservedContext | null => {
  try {
    const parsed = GuideObservedContextSchema.safeParse(JSON.parse(element?.dataset.helpContext ?? ''))
    return parsed.success ? parsed.data : null
  } catch { return null }
}
const contextMatchesRecord = (context: GuideObservedContext | null, agreementId: string | null, reviewId: string | null) => {
  if (!context || (context.kind !== 'owner' && context.kind !== 'task')) return false
  if (reviewId) return context.kind === 'task' && context.taskId === `review:${reviewId}`
  const binding = context.kind === 'owner' ? context.binding : context.execution.binding
  return Boolean(agreementId && binding?.resourceType === 'fundingcaseagreement' && binding.resourceId === agreementId)
}
const readView = () => {
  const views = [...window.document.querySelectorAll<HTMLElement>('[data-help-view]')]
    .filter(view => view.getClientRects().length > 0)
  const modalView = views.find(view => {
    const dialog = view.closest('[role="dialog"]')
    return dialog && dialog.getAttribute('data-state') !== 'closed'
  })
  const view = modalView ?? views.find(candidate => !views.some(other => candidate !== other && candidate.contains(other)))
  currentView.value = view?.dataset.helpView ?? ''
  viewAgencyId.value = view?.closest<HTMLElement>('[data-help-agency]')?.dataset.helpAgency ?? ''
  viewReviewId.value = view?.closest<HTMLElement>('[data-help-review-id]')?.dataset.helpReviewId ?? ''
  viewAgreementId.value = view?.closest<HTMLElement>('[data-help-agreement-id]')?.dataset.helpAgreementId ?? ''
  const contexts = [...(view?.querySelectorAll<HTMLElement>('[data-help-context]') ?? [])]
    .filter(element => element.getClientRects().length > 0)
  const renderedContext = contexts.find(element => !contexts.some(other => element !== other && element.contains(other)))
    ?? view?.closest<HTMLElement>('[data-help-context]')
  let context = readDeclaredContext(renderedContext)
  const routeReviewId = 'reviewId' in route.value.params && typeof route.value.params.reviewId === 'string' ? route.value.params.reviewId : null
  const isAgreementDetail = typeof route.value.name === 'string' && route.value.name.replace(/___(?:en|fr)$/, '') === 'agreements-id'
  const routeAgreementId = isAgreementDetail && 'id' in route.value.params && typeof route.value.params.id === 'string' ? route.value.params.id : null
  if (modalView && !viewReviewId.value && !viewAgreementId.value && !renderedContext && (routeAgreementId || routeReviewId)) {
    const owners = views.flatMap(candidate => {
      if (candidate.closest('[role="dialog"]')) return []
      if (routeReviewId ? candidate.dataset.helpReviewId !== routeReviewId : candidate.dataset.helpAgreementId !== routeAgreementId) return []
      const loaded = readDeclaredContext(candidate)
      return contextMatchesRecord(loaded, routeAgreementId, routeReviewId) ? [{ element: candidate, context: loaded }] : []
    })
    const owner = owners.length === 1 ? owners[0] : undefined
    const ownerAgency = owner?.element.closest<HTMLElement>('[data-help-agency]')?.dataset.helpAgency ?? ''
    if (owner && (!viewAgencyId.value || viewAgencyId.value === ownerAgency)) {
      viewAgencyId.value = ownerAgency
      viewReviewId.value = owner.element.dataset.helpReviewId ?? ''
      viewAgreementId.value = owner.element.dataset.helpAgreementId ?? ''
      context = owner.context
    }
  }
  const conflictingModalContext = Boolean(modalView && (routeAgreementId || routeReviewId) && !contextMatchesRecord(context, routeAgreementId, routeReviewId))
  const matchesRoute = routeReviewId
    ? viewReviewId.value === routeReviewId
    : routeAgreementId ? viewAgreementId.value === routeAgreementId : Boolean(view)
  const requiresLoadedContext = Boolean(routeReviewId || routeAgreementId)
  const staleContextlessView = !context && loadedView !== null && loadedView.route !== routeIdentity() && view === loadedView.element && currentView.value === loadedView.key
  if (!matchesRoute || conflictingModalContext || (requiresLoadedContext && !context) || staleContextlessView) {
    setObservedContext({ kind: 'pending' })
    setReturnTarget(null)
    return
  }
  loadedView = view ? { element: view, key: currentView.value, route: routeIdentity() } : null
  if (context?.kind === 'owner' || context?.kind === 'task') {
    const facts = new Set(context.facts)
    if (viewAgreementId.value) facts.add('agreement.selected')
    if (currentView.value === 'agreement.risk-rating') facts.add('agreement.risk-rating')
    if (journeyAuthorized.value && journeyRuntime.value?.current) facts.add('agreement.workflow.started')
    setObservedContext({ ...context, view: currentView.value, facts: [...facts] })
  } else setObservedContext(context ?? { kind: 'elsewhere', view: currentView.value })
  const key = view?.dataset.helpReturnTarget ?? renderedContext?.dataset.helpReturnTarget
  const returnMatchesBinding = !journeyBinding.value || (context?.kind === 'task'
    && context.execution.binding.resourceType === journeyBinding.value.resourceType
    && context.execution.binding.resourceId === journeyBinding.value.resourceId)
  setReturnTarget(key && returnMatchesBinding
    ? { kind: 'unique', key }
    : null)
}
const exit = () => {
  snapshot.value = null
  previewDocument.value = null
  previewJourney.value = { binding: null, cursor: null }
  previewAgencyId.value = ''
  previewStepId.value = undefined
  previewPath.value = undefined
  session?.clear()
  discoveryRequest.reset()
  journeyRequest.reset()
  selectionRequest.reset()
  journeyRuntime.value = null
  runtimeBindingId = ''
}
const discover = async () => {
  discoveryRequest.reset()
  items.value = []
  if (!currentView.value || guidedHelpLedger.views.find(view => view.key === currentView.value)?.discoverable === false || (!agencyId.value && currentView.value !== 'agreements.list')) return
  const request = discoveryRequest.begin('discovery')
  if (!request) return
  try {
    const discoveryUrl = currentView.value === 'agreements.list'
      ? `/api/guided-help/discovery?view=${encodeURIComponent(currentView.value)}`
      : `/api/agency/${agencyId.value}/guided-help/discovery?view=${encodeURIComponent(currentView.value)}${viewReviewId.value ? `&reviewId=${encodeURIComponent(viewReviewId.value)}` : ''}${viewAgreementId.value ? `&agreementId=${encodeURIComponent(viewAgreementId.value)}` : ''}`
    const result = await helpRequest<{ items: { id: string, agencyId?: string, document: GuideDocument }[] }>(discoveryUrl)
    if (!discoveryRequest.isCurrent(request)) return
    items.value = result.items
    discoveryRequest.succeed(request)
  } catch (error) {
    if (discoveryRequest.isCurrent(request)) {
      discoveryRequest.fail(request, error)
      showError(error)
    }
  }
}
const launch = async (id: string) => {
  const launchAgencyId = items.value.find(item => item.id === id)?.agencyId ?? agencyId.value
  if (loading.value || !user.value?.id || !launchAgencyId || !currentView.value) return
  const request = discoveryRequest.begin('launch')
  if (!request) return
  const launchedUser = user.value.id
  try {
    const result = await helpRequest<{ agencyId: string, catalogId: string, publicationVersionId: string, sourceVersionId: string, document: GuideDocument }>(`/api/agency/${launchAgencyId}/guided-help/${id}/launch`, 'POST', { view: currentView.value, ...(viewReviewId.value ? { reviewId: viewReviewId.value } : {}), ...(viewAgreementId.value ? { agreementId: viewAgreementId.value } : {}) })
    if (!discoveryRequest.isCurrent(request) || launchedUser !== user.value?.id) return
    previewDocument.value = null
    snapshot.value = session?.launch({ userId: launchedUser, agencyId: result.agencyId, publicationId: result.publicationVersionId, versionId: result.sourceVersionId, document: result.document }) ?? null
    discoveryRequest.succeed(request)
  } catch (error) {
    if (discoveryRequest.isCurrent(request)) {
      discoveryRequest.fail(request, error)
      showError(error)
    }
  }
}
const journeyRegistration = computed(() => guidedHelpJourneys.find(item => item.adapter === document.value?.journey?.adapter))
const journeyBinding = computed(() => previewDocument.value?.journey ? previewJourney.value.binding : snapshot.value?.journey?.binding ?? null)
const journeyText = (key: string) => ({ en: t(`workflow.help.${key}`, {}, { locale: 'en' }), fr: t(`workflow.help.${key}`, {}, { locale: 'fr' }) })
const journeyPresentation = computed<GuidePresentation | null>(() => journeyBinding.value && viewAgreementId.value
  && viewAgreementId.value !== journeyBinding.value.resourceId
  && observedContext.value.kind !== 'pending'
  ? { view: currentView.value, target: null, title: { en: t('common.unavailable', {}, { locale: 'en' }), fr: t('common.unavailable', {}, { locale: 'fr' }) }, instructions: journeyText('journey_wrong_record') }
  : null)
const journeyProjection = computed(() => buildGuidedHelpWorkflowRuntime({ runtime: journeyRuntime.value, copy: {
  assignment: journeyText('assignment'), approval: journeyText('approval'),
  pending: journeyText('pending'), paused: journeyText('paused'), stopped: journeyText('stopped'), reviews: journeyText('reviews'),
  recommendations: { en: t('workflow.recommendation_set', {}, { locale: 'en' }), fr: t('workflow.recommendation_set', {}, { locale: 'fr' }) },
  dataCollection: { en: t('workflow.data_collection', {}, { locale: 'en' }), fr: t('workflow.data_collection', {}, { locale: 'fr' }) },
  finalApproval: { en: t('workflow.final_approval', {}, { locale: 'en' }), fr: t('workflow.final_approval', {}, { locale: 'fr' }) }
} }))
const journeySnapshot = computed<GuideJourneySnapshot>(() => {
  const registration = journeyRegistration.value
  const binding = journeyBinding.value
  const projection = journeyProjection.value
  const ready = Boolean(binding && journeyAuthorized.value && !journeyLoading.value)
  const reason = journeyText(journeyFailed.value ? 'journey_unavailable' : journeyLoading.value ? 'journey_loading' : 'pending')
  return { binding, execution: binding && journeyRuntime.value?.current ? { binding, executionId: journeyRuntime.value.current.runtimeId } : null, stages: (registration?.stages ?? []).map(stage => {
    const base = { id: stage.id, title: stage.label }
    if (stage.id === 'choose-agreement') return { ...base, kind: 'once', status: binding ? 'completed' : 'available' }
    if (!ready) return stage.kind === 'tasks'
      ? { ...base, kind: 'tasks', tasks: [], status: 'blocked', reason }
      : { ...base, kind: 'once', status: 'blocked', reason }
    if (stage.id === 'start-workflow') return { ...base, kind: 'once',
      status: journeyRuntime.value?.current ? 'completed' : 'available' }
    if (stage.kind === 'tasks') return { ...base, kind: 'tasks', tasks: projection.tasks,
      status: projection.succeeded ? 'completed' : 'available' }
    return { ...base, kind: 'once', status: projection.succeeded ? 'available' : 'blocked', reason }
  }) }
})
const persistJourney = (cursor: GuideJourneyCursor | null) => {
  if (!cursor) return
  if (previewDocument.value?.journey) {
    previewJourney.value = { ...previewJourney.value, cursor, executionId: journeyRuntime.value?.current?.runtimeId ?? null }
    return
  }
  if (!user.value?.id || !snapshot.value?.journey) return
  const previous = snapshot.value
  const updated = session?.updateJourney(user.value.id, { binding: previous.journey?.binding ?? null, cursor, executionId: journeyRuntime.value?.current?.runtimeId ?? null })
  if (updated) snapshot.value = { ...updated, document: previous.document }
}
const refreshJourney = async () => {
  const binding = journeyBinding.value
  const registration = journeyRegistration.value
  journeyRequest.reset()
  if (!binding || !registration) {
    journeyRuntime.value = null
    runtimeBindingId = ''
    return
  }
  if (runtimeBindingId !== binding.resourceId) journeyRuntime.value = null
  const expectedAgencyId = previewDocument.value ? previewAgencyId.value : snapshot.value?.agencyId
  if (!expectedAgencyId) return
  const request = journeyRequest.begin('journey')
  if (!request) return
  try {
    const agreement = await helpRequest<{ id: string; agency_id: string }>(`/api/agreements/${encodeURIComponent(binding.resourceId)}`)
    if (!journeyRequest.isCurrent(request)) return
    if (String(agreement.id) !== binding.resourceId || String(agreement.agency_id) !== expectedAgencyId) throw new Error(t('workflow.help.journey_unavailable'))
    const runtime = await helpRequest<GuidedHelpWorkflowRuntime>(`/api/workflows/runtime?entityType=fundingcaseagreement&entityId=${encodeURIComponent(binding.resourceId)}&purpose=${registration.purpose}`)
    if (!journeyRequest.isCurrent(request)) return
    journeyRuntime.value = runtime
    runtimeBindingId = binding.resourceId
    journeyRequest.succeed(request)
  } catch (error) {
    if (journeyRequest.isCurrent(request)) {
      journeyRequest.fail(request, error)
      showError(error)
    }
  }
}
const bindAgreement = async (binding: GuideJourneyBinding) => {
  const current = snapshot.value
  const actor = user.value?.id
  if (!actor || !document.value?.journey || journeyBinding.value || binding.resourceType !== 'fundingcaseagreement') return
  const selectedDocument = document.value
  const request = selectionRequest.begin('selection')
  if (!request) return
  try {
    const agreement = await helpRequest<{ id: string; agency_id: string }>(`/api/agreements/${encodeURIComponent(binding.resourceId)}`)
    if (actor !== user.value?.id || !selectionRequest.isCurrent(request) || selectedDocument !== document.value || journeyBinding.value) return
    const selectedAgency = String(agreement.agency_id)
    if (String(agreement.id) !== binding.resourceId) return
    if (previewDocument.value) {
      if (previewAgencyId.value && previewAgencyId.value !== selectedAgency) return
      previewAgencyId.value = selectedAgency
      previewJourney.value = { binding, cursor: null }
      return
    }
    if (!current?.journey) return
    if (selectedAgency !== current.agencyId) {
      toast.add({ title: toast.localized('common.unavailable'), description: toast.localized('workflow.help.journey_other_agency'), color: 'warning' })
      return
    }
    const updated = session?.updateJourney(actor, { binding, cursor: null })
    if (updated) snapshot.value = { ...updated, document: current.document }
  } catch (error) {
    if (selectionRequest.isCurrent(request) && actor === user.value?.id && selectedDocument === document.value) {
      selectionRequest.fail(request, error)
      showError(error)
    }
  } finally {
    selectionRequest.succeed(request)
  }
}
const receiveSignal = (signal: GuideActionSignal) => {
  if (!document.value?.journey) return
  if (signal.kind === 'selected') void bindAgreement(signal.binding)
  if (signal.kind === 'invalidated' && signal.binding.resourceType === journeyBinding.value?.resourceType
    && signal.binding.resourceId === journeyBinding.value.resourceId) void refreshJourney()
}
watch([() => document.value?.journey?.adapter, () => journeyBinding.value?.resourceId, () => JSON.stringify(route.value.params)], () => {
  void refreshJourney()
})
watch(() => routeIdentity(), value => {
  if (value === loadedView?.route) {
    readView()
    return
  }
  setObservedContext({ kind: 'pending' })
  setReturnTarget(null)
}, { flush: 'sync' })
watch([journeyAuthorized, () => journeyRuntime.value?.current?.runtimeId], readView)
const select = (stepId: string, path?: string[]) => {
  if (previewDocument.value) {
    previewStepId.value = stepId
    previewPath.value = path
  }
  if (!previewDocument.value && user.value?.id) {
    const current = snapshot.value
    const selected = session?.select(user.value.id, stepId, path) ?? null
    // Progress changes do not replace pinned content or restart Driver's focus handling.
    snapshot.value = selected && current && selected.versionId === current.versionId
      && selected.publicationId === current.publicationId && selected.agencyId === current.agencyId
      ? { ...selected, document: current.document }
      : selected
  }
}
const preview = (event: Event) => {
  const draft = (event as CustomEvent<{ document: unknown }>).detail.document
  const result = GuideDocumentSchema.safeParse(draft)
  if (!result.success || checkHostGuideCompatibility(result.data, guidedHelpLedger).length) {
    toast.add({ title: toast.localized('common.error'), description: toast.localized('guided_help.preview_incomplete'), color: 'error' })
    return
  }
  exit()
  previewDocument.value = result.data
  const context = (event as CustomEvent<{ agencyId?: string }>).detail.agencyId
  previewAgencyId.value = context ?? ''
  previewJourney.value = { binding: null, cursor: null }
  readerKey.value += 1
}
const completePicker = () => {
  pickerState.value = { kind: 'inactive' }
}
const pick = () => {
  pickerState.value = { kind: 'selecting' }
}
const cancelPicker = () => {
  completePicker()
  clearHelpPicker()
}
const pickTarget = (event: MouseEvent) => {
  if (pickerState.value.kind !== 'selecting' || !(event.target instanceof Element)) return
  const target = event.target.closest<HTMLElement>('[data-help-target]')
  const key = target?.dataset.helpTarget
  const view = guidedHelpLedger.views.find(item => item.targets.some(candidate => candidate.key === key))
  if (!key || !view?.targets.some(item => item.key === key)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const state = user.value?.id ? readHelpPicker(user.value.id) : null
  const declaration = view.targets.find(item => item.key === key)
  if (state && declaration) saveHelpPicker({ ...state, selected: { view: view.key, target: declaration.key, kind: declaration.kind } })
  pickerState.value = { kind: 'selected' }
}
watch(() => user.value?.id, (id, previousId) => {
  if (previousId && previousId !== id) {
    exit()
    readerKey.value++
    clearHelpPicker()
    pickerState.value = { kind: 'inactive' }
  }
  discoveryRequest.reset()
  journeyRequest.reset()
  items.value = []
  previewDocument.value = null
  if (!id) {
    exit()
    clearHelpPicker()
    pickerState.value = { kind: 'inactive' }
    return
  }
  snapshot.value = session?.restore(id) ?? null
})
watch(requestedGuideId, id => {
  if (id) {
    requestedGuideId.value = null
    void launch(id)
  }
})
watch([agencyId, currentView, viewReviewId, viewAgreementId, () => user.value?.id], () => {
  requestedGuideId.value = null
  discoveryRequest.reset()
  items.value = []
  if (user.value?.id && !document.value) void discover()
})
onMounted(() => {
  session = createGuideSession(sessionStorage)
  if (user.value?.id) {
    snapshot.value = session.restore(user.value.id)
    const storedPicker = readHelpPicker(user.value.id)
    if (storedPicker) {
      pickerState.value = { kind: 'selecting' }
    }
  }
  readView()
  observer = new MutationObserver(readView)
  observer.observe(window.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-help-view', 'data-help-agency', 'data-help-review-id', 'data-help-agreement-id', 'data-help-workflow-task-id', 'data-help-context', 'data-help-return-target', 'data-state'] })
  window.addEventListener('guided-help:preview', preview)
  window.addEventListener('guided-help:pick', pick)
  window.addEventListener('guided-help:picker-complete', completePicker)
  window.document.addEventListener('click', pickTarget, true)
})
onBeforeUnmount(() => {
  active.value = false
  items.value = []
  discoveryRequest.dispose()
  journeyRequest.dispose()
  selectionRequest.dispose()
  observer?.disconnect()
  window.removeEventListener('guided-help:preview', preview)
  window.removeEventListener('guided-help:pick', pick)
  window.removeEventListener('guided-help:picker-complete', completePicker)
  window.document.removeEventListener('click', pickTarget, true)
})
</script>

<template>
  <GuidedHelpJourney v-if="document?.journey" :key="readerKey" :document="document" :snapshot="journeySnapshot" :locale="locale === 'fr' ? 'fr' : 'en'" :current-view="currentView" :ledger="guidedHelpLedger" :action-channel="actionChannel" :observed-context="observedContext" :return-target="returnTarget" :presentation="journeyPresentation" :freshness="journeyLoading ? 'loading' : journeyFailed ? 'unavailable' : 'ready'" :initial-cursor="previewDocument ? previewJourney.cursor : snapshot?.journey?.cursor" :initial-execution-id="previewDocument ? previewJourney.executionId : snapshot?.journey?.executionId" :notice="previewDocument ? t('guided_help.preview_warning') : undefined" @select="persistJourney" @exit="exit" @signal="receiveSignal" />
  <GuidedHelpPanel v-if="document && !document.journey" :key="readerKey" :document="document" :locale="locale === 'fr' ? 'fr' : 'en'" :current-view="currentView" :ledger="guidedHelpLedger" :action-channel="actionChannel" :observed-context="observedContext" :initial-step-id="previewDocument ? previewStepId : snapshot?.stepId" :initial-path="previewDocument ? previewPath : snapshot?.path" :notice="previewDocument ? t('guided_help.preview_warning') : undefined" @select="select" @exit="exit" />
  <div v-if="pickerMessage" role="status" class="bg-default fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border p-4 shadow-lg">
    {{ pickerMessage }} <UButton :to="localePath(appRouteLocations.guidedHelp())" :label="t('guided_help.pick_return')" /> <UButton :label="t('common.cancel')" @click="cancelPicker" />
  </div>
</template>
