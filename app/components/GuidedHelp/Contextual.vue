<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Host owns discovery and launch
package owns the tour. */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import GuidedHelpPanel from '@gcs-ssc/guided-help/components/GuidedHelpPanel.vue'
import { GuideDocumentSchema, checkGuideCompatibility } from '@gcs-ssc/guided-help/contracts'
import type { GuideDocument } from '@gcs-ssc/guided-help/contracts'
import { createGuideSession } from '@gcs-ssc/guided-help/session'
import type { GuideSessionSnapshot } from '@gcs-ssc/guided-help/session'
import '@gcs-ssc/guided-help/style.css'
import { useGuidedHelpDiscovery } from '~/composables/useGuidedHelpDiscovery'
import { helpRequest } from '~/utils/guided-help-client'
import { clearHelpPicker, readHelpPicker, saveHelpPicker } from '~/utils/guided-help-picker'
import { appRouteLocations } from '~/utils/route-locations'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'

const { t, locale } = useI18n()
const { user } = useAuth()
const route = useRoute()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const currentView = ref('')
const loading = ref(false)
const { items, loading: discoveryLoading, active, requestedGuideId } = useGuidedHelpDiscovery()
const snapshot: Ref<GuideSessionSnapshot | null> = ref(null)
const previewDocument: Ref<GuideDocument | null> = ref(null)
const pickerMessage = ref('')
const previewStepId: Ref<string | undefined> = ref(undefined)
const previewPath: Ref<string[] | undefined> = ref(undefined)
let session: ReturnType<typeof createGuideSession> | null = null
let observer: MutationObserver | null = null
let generation = 0
const agencyId = computed(() => {
  const agencyRoute = /\/(?:agencies|agences)\/([^/]+)/.exec(route.path)
  return agencyRoute?.[1] ?? ''
})
const document = computed(() => previewDocument.value ?? snapshot.value?.document ?? null)
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
  currentView.value = (modalView ?? views[0])?.dataset.helpView ?? ''
}
const exit = () => {
  snapshot.value = null
  previewDocument.value = null
  previewStepId.value = undefined
  previewPath.value = undefined
  session?.clear()
}
const discover = async () => {
  const request = ++generation
  items.value = []
  if (!agencyId.value || !currentView.value) return
  discoveryLoading.value = true
  try {
    const result = await helpRequest<{ items: { id: string, document: GuideDocument }[] }>(`/api/agency/${agencyId.value}/guided-help/discovery?view=${encodeURIComponent(currentView.value)}`)
    if (request === generation) items.value = result.items
  } catch (error) {
    if (request === generation) showError(error)
  } finally {
    if (request === generation) discoveryLoading.value = false
  }
}
const launch = async (id: string) => {
  if (loading.value || !user.value?.id) return
  const request = ++generation
  const launchedUser = user.value.id
  loading.value = true
  try {
    const result = await helpRequest<{ agencyId: string, catalogId: string, publicationVersionId: string, sourceVersionId: string, document: GuideDocument }>(`/api/agency/${agencyId.value}/guided-help/${id}/launch`, 'POST', { view: currentView.value })
    if (request !== generation || launchedUser !== user.value?.id) return
    previewDocument.value = null
    snapshot.value = session?.launch({ userId: launchedUser, agencyId: result.agencyId, publicationId: result.publicationVersionId, versionId: result.sourceVersionId, document: result.document }) ?? null
  } catch (error) {
    if (request === generation) showError(error)
  } finally {
    if (request === generation) loading.value = false
  }
}
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
  if (!result.success || checkGuideCompatibility(result.data, guidedHelpLedger).length) {
    showError(new Error(t('guided_help.preview_incomplete')))
    return
  }
  exit()
  previewDocument.value = result.data
}
const completePicker = () => {
  picking = null
  pickerMessage.value = ''
}
let picking: { view: string, target: string } | null = null
const pick = (event: Event) => {
  picking = (event as CustomEvent<{ view: string, target: string }>).detail
  pickerMessage.value = t('guided_help.pick_instructions')
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
  pickerMessage.value = t('guided_help.pick_selected')
}
watch(() => user.value?.id, (id, previousId) => {
  if (previousId && previousId !== id) {
    clearHelpPicker()
    pickerMessage.value = ''
    picking = null
  }
  generation++
  items.value = []
  loading.value = false
  previewDocument.value = null
  if (!id) {
    exit()
    clearHelpPicker()
    pickerMessage.value = ''
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
watch([agencyId, currentView, () => user.value?.id], () => {
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
      pickerMessage.value = t('guided_help.pick_instructions')
    }
  }
  readView()
  observer = new MutationObserver(readView)
  observer.observe(window.document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-help-view', 'data-state'] })
  window.addEventListener('guided-help:preview', preview)
  window.addEventListener('guided-help:pick', pick)
  window.addEventListener('guided-help:picker-complete', completePicker)
  window.document.addEventListener('click', pickTarget, true)
})
onBeforeUnmount(() => {
  active.value = false
  items.value = []
  generation++
  observer?.disconnect()
  window.removeEventListener('guided-help:preview', preview)
  window.removeEventListener('guided-help:pick', pick)
  window.removeEventListener('guided-help:picker-complete', completePicker)
  window.document.removeEventListener('click', pickTarget, true)
})
</script>

<template>
  <GuidedHelpPanel v-if="document" :document="document" :locale="locale === 'fr' ? 'fr' : 'en'" :current-view="currentView" :initial-step-id="previewDocument ? previewStepId : snapshot?.stepId" :initial-path="previewDocument ? previewPath : snapshot?.path" :notice="previewDocument ? t('guided_help.preview_warning') : undefined" @select="select" @exit="exit" />
  <div v-if="pickerMessage" role="status" class="bg-default fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border p-4 shadow-lg">
    {{ pickerMessage }} <UButton :to="localePath(appRouteLocations.guidedHelp())" :label="t('guided_help.pick_return')" /> <UButton :label="t('common.cancel')" @click="picking = null; pickerMessage = ''; clearHelpPicker()" />
  </div>
</template>
