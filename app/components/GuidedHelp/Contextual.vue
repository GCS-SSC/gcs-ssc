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
const journeyAuthorized = ref(false)
const journeyLoading = ref(false)
const journeyFailed = ref(false)
let journeyGeneration = 0
let selectionGeneration = 0
let runtimeBindingId = ''
const loading = ref(false)
const { items, loading: discoveryLoading, active, requestedGuideId } = useGuidedHelpDiscovery()
const snapshot: Ref<GuideSessionSnapshot | null> = ref(null)
const previewDocument: Ref<GuideDocument | null> = ref(null)
const previewJourney: Ref<GuideJourneySession> = ref({ binding: null, cursor: null })
const previewAgencyId = ref('')
const journeyReaderKey = ref(0)
const pickerMessageKey = ref('')
const pickerMessage = computed(() => pickerMessageKey.value ? t(pickerMessageKey.value) : '')
const previewStepId: Ref<string | undefined> = ref(undefined)
const previewPath: Ref<string[] | undefined> = ref(undefined)
let session: ReturnType<typeof createGuideSession> | null = null
let observer: MutationObserver | null = null
let generation = 0
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
watch(loading, value => {
  discoveryLoading.value = value
})
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
  viewReviewId.value = view?.dataset.helpReviewId ?? ''
  viewAgreementId.value = view?.dataset.helpAgreementId ?? ''
  const contexts = [...(view?.querySelectorAll<HTMLElement>('[data-help-context]') ?? [])]
    .filter(element => element.getClientRects().length > 0)
  const renderedContext = contexts.find(element => !contexts.some(other => element !== other && element.contains(other)))
    ?? view?.closest<HTMLElement>('[data-help-context]')
  let context: GuideObservedContext | null = null
  if (renderedContext?.dataset.helpContext) {
    try {
      const parsed = GuideObservedContextSchema.safeParse(JSON.parse(renderedContext.dataset.helpContext))
      if (parsed.success) context = parsed.data
    } catch { /* An incomplete render cannot prove a loaded business context. */ }
  }
  const routeReviewId = typeof route.value.params.reviewId === 'string' ? route.value.params.reviewId : null
  const routeAgreementId = typeof route.value.params.id === 'string' && /\/(?:agreements|ententes)\//.test(route.value.path) ? route.value.params.id : null
  const matchesRoute = routeReviewId
    ? viewReviewId.value === routeReviewId
    : routeAgreementId ? viewAgreementId.value === routeAgreementId : Boolean(view)
  const requiresLoadedContext = Boolean(routeReviewId || routeAgreementId)
  const staleContextlessView = !context && loadedView !== null && loadedView.route !== routeIdentity() && view === loadedView.element && currentView.value === loadedView.key
  if (!matchesRoute || (requiresLoadedContext && !context) || staleContextlessView) {
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
  journeyGeneration++
  selectionGeneration++
  journeyRuntime.value = null
  runtimeBindingId = ''
  journeyAuthorized.value = false
  journeyLoading.value = false
  journeyFailed.value = false
}
const discover = async () => {
  const request = ++generation
  items.value = []
  if (!currentView.value || guidedHelpLedger.views.find(view => view.key === currentView.value)?.discoverable === false || (!agencyId.value && currentView.value !== 'agreements.list')) return
  discoveryLoading.value = true
  try {
    const discoveryUrl = currentView.value === 'agreements.list'
      ? `/api/guided-help/discovery?view=${encodeURIComponent(currentView.value)}`
      : `/api/agency/${agencyId.value}/guided-help/discovery?view=${encodeURIComponent(currentView.value)}${viewReviewId.value ? `&reviewId=${encodeURIComponent(viewReviewId.value)}` : ''}${viewAgreementId.value ? `&agreementId=${encodeURIComponent(viewAgreementId.value)}` : ''}`
    const result = await helpRequest<{ items: { id: string, agencyId?: string, document: GuideDocument }[] }>(discoveryUrl)
    if (request === generation) items.value = result.items
  } catch (error) {
    if (request === generation) showError(error)
  } finally {
    if (request === generation) discoveryLoading.value = false
  }
}
const launch = async (id: string) => {
  const launchAgencyId = items.value.find(item => item.id === id)?.agencyId ?? agencyId.value
  if (loading.value || !user.value?.id || !launchAgencyId || !currentView.value) return
  const request = ++generation
  const launchedUser = user.value.id
  loading.value = true
  try {
    const result = await helpRequest<{ agencyId: string, catalogId: string, publicationVersionId: string, sourceVersionId: string, document: GuideDocument }>(`/api/agency/${launchAgencyId}/guided-help/${id}/launch`, 'POST', { view: currentView.value, ...(viewReviewId.value ? { reviewId: viewReviewId.value } : {}), ...(viewAgreementId.value ? { agreementId: viewAgreementId.value } : {}) })
    if (request !== generation || launchedUser !== user.value?.id) return
    previewDocument.value = null
    snapshot.value = session?.launch({ userId: launchedUser, agencyId: result.agencyId, publicationId: result.publicationVersionId, versionId: result.sourceVersionId, document: result.document }) ?? null
  } catch (error) {
    if (request === generation) showError(error)
  } finally {
    if (request === generation) loading.value = false
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
  const request = ++journeyGeneration
  journeyAuthorized.value = false
  journeyFailed.value = false
  if (!binding || !registration) {
    journeyRuntime.value = null
    runtimeBindingId = ''
    journeyLoading.value = false
    return
  }
  if (runtimeBindingId !== binding.resourceId) journeyRuntime.value = null
  const expectedAgencyId = previewDocument.value ? previewAgencyId.value : snapshot.value?.agencyId
  if (!expectedAgencyId) return
  journeyLoading.value = true
  try {
    const agreement = await helpRequest<{ id: string; agency_id: string }>(`/api/agreements/${encodeURIComponent(binding.resourceId)}`)
    if (request !== journeyGeneration) return
    if (String(agreement.id) !== binding.resourceId || String(agreement.agency_id) !== expectedAgencyId) throw new Error(t('workflow.help.journey_unavailable'))
    const runtime = await helpRequest<GuidedHelpWorkflowRuntime>(`/api/workflows/runtime?entityType=fundingcaseagreement&entityId=${encodeURIComponent(binding.resourceId)}&purpose=${registration.purpose}`)
    if (request !== journeyGeneration) return
    journeyRuntime.value = runtime
    runtimeBindingId = binding.resourceId
    journeyAuthorized.value = true
  } catch (error) {
    if (request === journeyGeneration) {
      journeyFailed.value = true
      showError(error)
    }
  } finally {
    if (request === journeyGeneration) journeyLoading.value = false
  }
}
const bindAgreement = async (binding: GuideJourneyBinding) => {
  const current = snapshot.value
  const actor = user.value?.id
  if (!actor || !document.value?.journey || journeyBinding.value || binding.resourceType !== 'fundingcaseagreement') return
  const selectedDocument = document.value
  const selectedGeneration = ++selectionGeneration
  try {
    const agreement = await helpRequest<{ id: string; agency_id: string }>(`/api/agreements/${encodeURIComponent(binding.resourceId)}`)
    if (actor !== user.value?.id || selectedGeneration !== selectionGeneration || selectedDocument !== document.value || journeyBinding.value) return
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
    if (actor === user.value?.id && selectedDocument === document.value) showError(error)
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
  journeyReaderKey.value += 1
}
const completePicker = () => {
  picking = null
  pickerMessageKey.value = ''
}
let picking: { view: string, target: string } | null = null
const pick = (event: Event) => {
  picking = (event as CustomEvent<{ view: string, target: string }>).detail
  pickerMessageKey.value = 'guided_help.pick_instructions'
}
const pickTarget = (event: MouseEvent) => {
  if (!picking || !(event.target instanceof Element)) return
  const target = event.target.closest<HTMLElement>('[data-help-target]')
  const key = target?.dataset.helpTarget
  const view = guidedHelpLedger.views.find(item => item.targets.some(candidate => candidate.key === key))
  if (!key || !view?.targets.some(item => item.key === key)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const state = user.value?.id ? readHelpPicker(user.value.id) : null
  const declaration = view.targets.find(item => item.key === key)
  if (state && declaration) saveHelpPicker({ ...state, selected: { view: view.key, target: declaration.key, kind: declaration.kind } })
  picking = null
  pickerMessageKey.value = 'guided_help.pick_selected'
}
watch(() => user.value?.id, (id, previousId) => {
  if (previousId && previousId !== id) {
    exit()
    journeyReaderKey.value++
    clearHelpPicker()
    pickerMessageKey.value = ''
    picking = null
  }
  generation++
  journeyGeneration++
  items.value = []
  loading.value = false
  previewDocument.value = null
  if (!id) {
    exit()
    clearHelpPicker()
    pickerMessageKey.value = ''
    picking = null
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
  generation++
  loading.value = false
  items.value = []
  discoveryLoading.value = false
  if (user.value?.id && !document.value) void discover()
})
onMounted(() => {
  session = createGuideSession(sessionStorage)
  if (user.value?.id) {
    snapshot.value = session.restore(user.value.id)
    const storedPicker = readHelpPicker(user.value.id)
    if (storedPicker) {
      picking = { view: '', target: '' }
      pickerMessageKey.value = 'guided_help.pick_instructions'
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
  generation++
  journeyGeneration++
  selectionGeneration++
  observer?.disconnect()
  window.removeEventListener('guided-help:preview', preview)
  window.removeEventListener('guided-help:pick', pick)
  window.removeEventListener('guided-help:picker-complete', completePicker)
  window.document.removeEventListener('click', pickTarget, true)
})
</script>

<template>
  <GuidedHelpJourney v-if="document?.journey" :key="journeyReaderKey" :document="document" :snapshot="journeySnapshot" :locale="locale === 'fr' ? 'fr' : 'en'" :current-view="currentView" :ledger="guidedHelpLedger" :action-channel="actionChannel" :observed-context="observedContext" :return-target="returnTarget" :presentation="journeyPresentation" :freshness="journeyLoading ? 'loading' : journeyFailed ? 'unavailable' : 'ready'" :initial-cursor="previewDocument ? previewJourney.cursor : snapshot?.journey?.cursor" :initial-execution-id="previewDocument ? previewJourney.executionId : snapshot?.journey?.executionId" :notice="previewDocument ? t('guided_help.preview_warning') : undefined" @select="persistJourney" @exit="exit" @signal="receiveSignal" />
  <GuidedHelpPanel v-if="document && !document.journey" :document="document" :locale="locale === 'fr' ? 'fr' : 'en'" :current-view="currentView" :ledger="guidedHelpLedger" :action-channel="actionChannel" :observed-context="observedContext" :initial-step-id="previewDocument ? previewStepId : snapshot?.stepId" :initial-path="previewDocument ? previewPath : snapshot?.path" :notice="previewDocument ? t('guided_help.preview_warning') : undefined" @select="select" @exit="exit" />
  <div v-if="pickerMessage" role="status" class="bg-default fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border p-4 shadow-lg">
    {{ pickerMessage }} <UButton :to="localePath(appRouteLocations.guidedHelp())" :label="t('guided_help.pick_return')" /> <UButton :label="t('common.cancel')" @click="picking = null; pickerMessage = ''; clearHelpPicker()" />
  </div>
</template>
