<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Catalog actions are explicit HTTP-boundary adapters. */
import GuidedHelpPublisherFlow from './PublisherFlow.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { GuideDraftSchema, GuideDocumentSchema, checkGuideCompatibility } from '@gcs-ssc/guided-help/contracts'
import type { ContractDiagnostic, GuideDraft } from '@gcs-ssc/guided-help/contracts'
import { blankGuide, catalogDraft, helpRequest } from '~/utils/guided-help-client'
import type { HelpAttribution, HelpCatalog, HelpGuide, HelpOption, HelpVersion } from '~/utils/guided-help-client'
import { clearHelpPicker, readHelpPicker, saveHelpPicker } from '~/utils/guided-help-picker'
import { GuidedHelpCatalogSettingsSchema } from '~~/shared/types/schemas/guided-help'
import { guidedHelpLedger } from '~~/shared/guided-help/catalog'
import type { PublisherGroup } from '~/utils/guided-help-publisher'
import { appRouteLocations } from '~/utils/route-locations'

const { detail = false } = defineProps<{ detail?: boolean }>()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { getHeroCollapsed } = useDashboard()
const collapsed = getHeroCollapsed('guided-help')
const selectedStep = ref('')

const { t, locale } = useI18n()
const { can } = useCan()
const { user } = useAuth()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const validateSettings = createValidator(GuidedHelpCatalogSettingsSchema)
const validateDraft = createValidator(GuideDraftSchema)
const validatePublication = createValidator(GuideDocumentSchema)
type PublisherForm = { submit: () => Promise<void>, setErrors: (errors: { name?: string, message: string }[]) => void }
const guideForm: Ref<PublisherForm | null> = ref(null)
const catalogForm: Ref<PublisherForm | null> = ref(null)
const groups: Ref<PublisherGroup[]> = ref([])
const contexts: Ref<HelpOption[]> = ref([])
const canSystem = ref(false)
const context = ref('')
const guides: Ref<HelpGuide[]> = ref([])
const shared: Ref<HelpGuide[]> = ref([])
const catalogs: Ref<HelpCatalog[]> = ref([])
const roles: Ref<HelpOption[]> = ref([])
const selected: Ref<HelpGuide | null> = ref(null)
const document: Ref<GuideDraft | null> = ref(null)
const sharedOffer = ref(false)
const selectedCatalog: Ref<HelpCatalog | null> = ref(null)
const settings: Ref<ReturnType<typeof catalogDraft> | null> = ref(null)
const versions: Ref<HelpVersion[]> = ref([])
const previewDiagnostics: Ref<ContractDiagnostic[]> = ref([])
const diagnosticText = (diagnostic: ContractDiagnostic) => t(`guided_help.diagnostics.${diagnostic.code}`, { view: diagnostic.view ?? '', target: diagnostic.target ?? '', step: diagnostic.stepId ?? '' })
const loading = ref(false)
type PendingAction = 'save' | 'publish' | 'retire' | 'clone' | 'delete' | 'unpublish'
const pendingAction = ref<PendingAction | null>(null)
const pending = computed(() => pendingAction.value !== null)
const loadError = ref(false)
let generation = 0
const scope = computed(() => context.value === 'system' ? { type: 'global' as const } : { type: 'agency' as const, agencyId: context.value })
const canEdit = computed(() => Boolean(context.value) && can('guided_help', 'update', scope.value))
const guideDirty = computed(() => Boolean(selected.value) && (JSON.stringify(GuideDraftSchema.safeParse(document.value).data) !== JSON.stringify(GuideDraftSchema.safeParse(selected.value?.egcs_cn_document).data) || sharedOffer.value !== selected.value?.egcs_cn_shared))
const catalogDirty = computed(() => Boolean(selectedCatalog.value?.id) && JSON.stringify(settings.value) !== JSON.stringify(catalogDraft(selectedCatalog.value!)))
const canDelete = computed(() => Boolean(context.value) && can('guided_help', 'delete', scope.value))
const agencyId = computed(() => context.value && context.value !== 'system' ? context.value : null)
const ownedEndpoint = computed(() => `/api/guided-help${agencyId.value ? `?agencyId=${agencyId.value}` : ''}`)
const catalogEndpoint = computed(() => `/api/agency/${agencyId.value}/guided-help`)
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const newestVersion = (guide: HelpGuide) => [...guide.versions].sort((left, right) => right.version - left.version)[0]
const views = computed(() => guidedHelpLedger.views.filter(view => view.discoverable !== false).map(view => ({ value: view.key, label: label(view.label) })))
const resetSelection = () => {
  previewDiagnostics.value = []
  selected.value = null
  document.value = null
  selectedCatalog.value = null
  settings.value = null
  versions.value = []
}
const reload = async () => {
  const request = ++generation
  resetSelection()
  guides.value = []
  catalogs.value = []
  shared.value = []
  roles.value = []
  if (!context.value) return
  loading.value = true
  loadError.value = false
  try {
    const [owned, catalog, library, roleOptions] = await Promise.all([
      helpRequest<{ items: HelpGuide[] }>(ownedEndpoint.value),
      agencyId.value ? helpRequest<{ items: HelpCatalog[] }>(catalogEndpoint.value) : Promise.resolve({ items: [] }),
      agencyId.value ? helpRequest<{ items: { id: string, document: GuideDraft, sourceVersionId: string, version: number, sourceAttribution?: HelpAttribution }[] }>(`/api/guided-help/shared?agencyId=${agencyId.value}`) : Promise.resolve({ items: [] }),
      agencyId.value ? helpRequest<{ items: HelpOption[] }>(`${catalogEndpoint.value}/roles`) : Promise.resolve({ items: [] })
    ])
    if (request !== generation) return
    guides.value = owned.items
    catalogs.value = catalog.items
    shared.value = library.items.map(item => ({ id: item.id, sourceAttribution: item.sourceAttribution, egcs_cn_document: item.document, egcs_cn_shared: true, versions: [{ id: item.sourceVersionId, version: item.version, document: item.document as HelpVersion['document'] }] }))
    roles.value = roleOptions.items
  } catch (error) {
    if (request === generation) {
      loadError.value = true
      showError(error)
    }
  } finally { if (request === generation) loading.value = false }
}
watch(context, async () => {
  await reload()
  if (!detail) await router.replace({ path: route.path, query: { ...route.query, context: context.value || undefined } })
})
onBeforeUnmount(() => {
  generation++
})
const initialize = async () => {
  loadError.value = false
  try {
    const options = await helpRequest<{ items: HelpOption[], canSystem: boolean }>('/api/guided-help/contexts')
    contexts.value = options.items
    canSystem.value = options.canSystem
    if (!detail) {
      groups.value = [...(options.canSystem ? [{ id: 'system', name: { en: '', fr: '' } }] : []), ...options.items].map(item => ({ ...item, guides: [], catalogs: [], shared: [], loaded: false, loading: false, error: false, canEdit: can('guided_help', 'update', item.id === 'system' ? { type: 'global' } : { type: 'agency', agencyId: item.id }) }))
    }
    const picking = user.value?.id ? readHelpPicker(user.value.id) : null
    if (picking && !detail) {
      await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(picking.guide?.id ?? 'new'), query: { context: picking.context, section: 'flow' } }))
      return
    }
    const requestedContext = detail && typeof route.query.context === 'string' ? route.query.context : ''
    if (!picking && requestedContext && (requestedContext === 'system' ? options.canSystem : options.items.some(item => item.id === requestedContext))) {
      context.value = requestedContext
      await nextTick()
      await reload()
      await loadRouteSelection()
    }
    if (picking && (picking.context === 'system' ? options.canSystem : options.items.some(item => item.id === picking.context))) {
      context.value = picking.context
      await nextTick()
      await reload()
      selected.value = picking.guide
      document.value = picking.document
      sharedOffer.value = picking.shared
      const target = picking.selected
      const declared = target && guidedHelpLedger.views.find(view => view.key === target.view)?.targets.find(item => item.key === target.target)
      if (target && declared && document.value) document.value.steps = document.value.steps.map(step => step.id === picking.stepId ? { ...step, view: target.view, target: declared.key, kind: declared.kind } : step)
      clearHelpPicker()
      window.dispatchEvent(new Event('guided-help:picker-complete'))
      selectedStep.value = picking.stepId
    }
  } catch (error) {
    loadError.value = true
    showError(error)
  }
}
onMounted(initialize)
const mutate = async (kind: PendingAction, action: () => Promise<void>) => {
  if (pending.value) return
  pendingAction.value = kind
  try {
    await action()
  } catch (error) {
    showError(error)
  } finally {
    pendingAction.value = null
  }
}
const openGuide = async (guide: HelpGuide) => {
  const request = generation
  const detail = await helpRequest<HelpGuide>(`/api/guided-help/${guide.id}`)
  if (request !== generation) return
  selectedCatalog.value = null
  settings.value = null
  selected.value = detail
  document.value = structuredClone(detail.egcs_cn_document)
  sharedOffer.value = detail.egcs_cn_shared
}
const createGuide = () => {
  resetSelection()
  document.value = blankGuide()
  sharedOffer.value = false
}
const persistGuide = async (): Promise<boolean> => {
  if (!document.value || !canEdit.value) return false
  const errors = await validateDraft(document.value)
  if (errors.length) {
    focusDraftError({ errors })
    showError(new Error(errors[0]!.message))
    return false
  }
  const request = generation
  const result = await helpRequest<HelpGuide>(selected.value ? `/api/guided-help/${selected.value.id}` : ownedEndpoint.value, selected.value ? 'PATCH' : 'POST', { egcs_cn_document: document.value, egcs_cn_shared: sharedOffer.value })
  if (request !== generation) return false
  selected.value = result
  document.value = structuredClone(result.egcs_cn_document)
  if (route.params.guideId === 'new') await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(result.id), query: { context: context.value, section: selectedTab.value } }))
  const index = guides.value.findIndex(guide => guide.id === result.id)
  if (index < 0) guides.value.push(result)
  else guides.value[index] = result
  return true
}
const saveGuide = () => mutate('save', async () => {
  await persistGuide()
})
const guideAction = (action: 'publish' | 'retire' | 'delete') => mutate(action, async () => {
  if (action === 'retire' && guideDirty.value) {
    showError(new Error(t('common.save_changes_before_action')))
    return
  }
  if (action === 'publish') {
    if (!document.value || !canEdit.value) return
    const errors = await validatePublication(document.value)
    if (errors.length) {
      focusDraftError({ errors })
      await nextTick()
      guideForm.value?.setErrors(errors)
      showError(new Error(errors[0]!.message))
      return
    }
    if ((!selected.value || guideDirty.value) && !await persistGuide()) return
  }
  if (!selected.value) return
  if (action === 'delete') {
    if (!await confirmDeleteRequest(`/api/guided-help/${selected.value.id}`)) return
  } else await helpRequest(`/api/guided-help/${selected.value.id}/${action}`, 'POST')
  await reload()
  if (action === 'delete') await goIndex()
  else await loadRouteSelection()
})
const openCatalog = async (catalog: HelpCatalog) => {
  const request = generation
  const detail = await helpRequest<HelpCatalog>(`${catalogEndpoint.value}/${catalog.id}`)
  if (request !== generation) return
  selected.value = null
  document.value = null
  selectedCatalog.value = detail
  settings.value = catalogDraft(detail)
  // Offered sources and owned sources expose only the versions the actor may inspect.
  const source = [...guides.value, ...shared.value].find(guide => guide.id === detail.egcs_ay_guide)
  versions.value = detail.sourceVersions ?? source?.versions ?? []
}
const adopt = (guide: HelpGuide) => {
  const version = newestVersion(guide)
  if (!version) return
  selected.value = null
  document.value = null
  selectedCatalog.value = { id: '', sourceVersionDocument: version.document, egcs_ay_guide: guide.id, egcs_ay_sourceversion: version.id, egcs_ay_discoveryscreens: [], egcs_ay_roles: [] }
  settings.value = catalogDraft(selectedCatalog.value)
  versions.value = guide.versions
}
const persistCatalog = async (): Promise<boolean> => {
  if (!selectedCatalog.value || !settings.value || !canEdit.value) return false
  const errors = await validateSettings(settings.value)
  if (errors.length) {
    catalogForm.value?.setErrors(errors)
    return false
  }
  const request = generation
  const result = await helpRequest<HelpCatalog>(`${catalogEndpoint.value}${selectedCatalog.value.id ? `/${selectedCatalog.value.id}` : ''}`, selectedCatalog.value.id ? 'PATCH' : 'POST', { ...(!selectedCatalog.value.id ? { egcs_ay_guide: selectedCatalog.value.egcs_ay_guide } : {}), ...settings.value })
  if (request !== generation) return false
  selectedCatalog.value = result
  settings.value = catalogDraft(result)
  const index = catalogs.value.findIndex(item => item.id === result.id)
  if (index < 0) catalogs.value.push(result)
  else catalogs.value[index] = result
  await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(result.egcs_ay_guide), query: { context: context.value, mode: 'catalog', catalog: result.id } }))
  return true
}
const saveCatalog = () => mutate('save', async () => {
  await persistCatalog()
})
const catalogAction = (action: 'publish' | 'unpublish') => mutate(action, async () => {
  if (action === 'unpublish' && catalogDirty.value) {
    showError(new Error(t('common.save_changes_before_action')))
    return
  }
  if (action === 'publish' && (!selectedCatalog.value?.id || catalogDirty.value) && !await persistCatalog()) return
  if (!selectedCatalog.value?.id) return
  await helpRequest(`${catalogEndpoint.value}/${selectedCatalog.value.id}/${action}`, 'POST')
  await reload()
  await loadRouteSelection()
})
const clone = (versionId: string) => mutate('clone', async () => {
  const result = await helpRequest<HelpGuide>(`${catalogEndpoint.value}/clone`, 'POST', { sourceVersionId: versionId })
  await goGuide(result.id)
})
const preview = (draft: GuideDraft, previewContext = context.value) => {
  const parsed = GuideDocumentSchema.safeParse(draft)
  previewDiagnostics.value = parsed.success ? checkGuideCompatibility(parsed.data, guidedHelpLedger) : []
  if (!parsed.success) {
    showError(new Error(t('guided_help.preview_incomplete')))
    return
  }
  if (previewDiagnostics.value.length) return
  window.dispatchEvent(new CustomEvent('guided-help:preview', { detail: { document: JSON.parse(JSON.stringify(draft)), agencyId: previewContext && previewContext !== 'system' ? previewContext : null } }))
}
const previewVersion = () => {
  const version = versions.value.find(item => item.id === settings.value?.egcs_ay_sourceversion)
  if (version) preview(version.document)
}
const pick = (target: { stepId: string, view: string, target: string }) => {
  if (!user.value?.id || !document.value) return
  saveHelpPicker({ userId: user.value.id, context: context.value, document: JSON.parse(JSON.stringify(document.value)), guide: selected.value ? JSON.parse(JSON.stringify(selected.value)) : null, shared: sharedOffer.value, stepId: target.stepId })
  window.dispatchEvent(new CustomEvent('guided-help:pick', { detail: target }))
}

const goIndex = () => router.push(localePath({ ...appRouteLocations.guidedHelp(), query: { context: context.value } }))
const goGuide = (id: string, ownerContext = context.value) => router.push(localePath({ ...appRouteLocations.guidedHelpDetail(id), query: { context: ownerContext } }))
const goCatalog = (sourceId: string, catalogId?: string, ownerContext = context.value) => router.push(localePath({ ...appRouteLocations.guidedHelpDetail(sourceId), query: { context: ownerContext, mode: 'catalog', ...(catalogId ? { catalog: catalogId } : {}) } }))
const loadGroup = async (id: string) => {
  const group = groups.value.find(item => item.id === id)
  if (!group || group.loading || group.loaded) return
  group.loading = true
  group.error = false
  const request = generation
  try {
    const [owned, catalog, library] = await Promise.all([
      helpRequest<{ items: HelpGuide[] }>(`/api/guided-help${id === 'system' ? '' : `?agencyId=${id}`}`),
      id === 'system' ? Promise.resolve({ items: [] }) : helpRequest<{ items: HelpCatalog[] }>(`/api/agency/${id}/guided-help`),
      id === 'system' ? Promise.resolve({ items: [] }) : helpRequest<{ items: { id: string, document: GuideDraft, sourceVersionId: string, version: number, sourceAttribution?: HelpAttribution }[] }>(`/api/guided-help/shared?agencyId=${id}`)
    ])
    if (request !== generation) return
    group.guides = owned.items
    group.catalogs = catalog.items
    group.shared = library.items.map(item => ({ id: item.id, sourceAttribution: item.sourceAttribution, egcs_cn_document: item.document, egcs_cn_shared: true, versions: [{ id: item.sourceVersionId, version: item.version, document: item.document as HelpVersion['document'] }] }))
    group.loaded = true
  } catch (error) {
    group.error = true
    showError(error)
  } finally { group.loading = false }
}
const cloneInto = (ownerContext: string, versionId: string) => mutate('clone', async () => {
  const result = await helpRequest<HelpGuide>(`/api/agency/${ownerContext}/guided-help/clone`, 'POST', { sourceVersionId: versionId })
  await goGuide(result.id, ownerContext)
})
const loadRouteSelection = async () => {
  if (!detail || !context.value) return
  const id = String(route.params.guideId)
  if (route.query.mode === 'catalog') {
    if (typeof route.query.catalog === 'string') {
      const entry = catalogs.value.find(item => item.id === route.query.catalog)
      if (entry) await openCatalog(entry)
      else loadError.value = true
    } else {
      const guide = [...guides.value, ...shared.value].find(item => item.id === id)
      if (guide) adopt(guide)
      else loadError.value = true
    }
  } else if (id === 'new') createGuide()
  else await openGuide({ id } as HelpGuide)
}
const focusDraftError = (event: { errors: { name?: string }[] }) => {
  const path = event.errors[0]?.name ?? ''
  const match = /^steps\.(\d+)\./.exec(path)
  if (match) {
    selectedStep.value = document.value?.steps[Number(match[1])]?.id ?? ''
    selectedTab.value = 'flow'
  } else selectedTab.value = 'general'
}
const isCatalog = computed(() => route.query.mode === 'catalog')
const sectionOptions = computed(() => isCatalog.value
  ? [{ key: 'guided_help.distribution', value: 'distribution', icon: 'i-lucide-users' }]
  : [{ key: 'agency.tabs.general', value: 'general', icon: 'i-lucide-info' }, { key: 'guided_help.flow', value: 'flow', icon: 'i-lucide-git-branch' }, { key: 'guided_help.version_history', value: 'history', icon: 'i-lucide-history' }])
const { tabs, selectedTab, selectedTabKey } = useUrlTabState({ tabs: sectionOptions, enabled: computed(() => detail) })
const selectedTitle = computed(() => isCatalog.value ? label(selectedCatalog.value?.sourceVersionDocument?.title ?? { en: '', fr: '' }) || t('guided_help.distribution') : document.value ? label(document.value.title) || t('guided_help.untitled') : t('guided_help.editor'))
const contextTitle = computed(() => context.value === 'system' ? t('guided_help.system') : label(contexts.value.find(item => item.id === context.value)?.name ?? { en: '', fr: '' }))
const breadcrumbItems = computed(() => [{ label: t('guided_help.title'), ...(detail ? { to: localePath({ ...appRouteLocations.guidedHelp(), query: { context: context.value } }) } : {}) }, ...(detail ? [{ label: selectedTitle.value }] : [])])
const pinnedVersion = computed(() => versions.value.find(version => version.id === settings.value?.egcs_ay_sourceversion))
const ownerAttribution = computed(() => selected.value?.sourceAttribution ?? selectedCatalog.value?.sourceAttribution)
const ownerName = computed(() => ownerAttribution.value ? ownerAttribution.value.ownerType === 'system' ? t('guided_help.system') : label(ownerAttribution.value.agencyName) : contextTitle.value)
const state = computed(() => isCatalog.value ? selectedCatalog.value?.publicationState : selected.value?.publicationState)
const hasUnpublishedChanges = computed(() => isCatalog.value ? catalogDirty.value || selectedCatalog.value?.hasUnpublishedChanges === true : guideDirty.value || selected.value?.hasUnpublishedChanges === true)
const publicationVersion = computed(() => (isCatalog.value ? selectedCatalog.value?.publicationVersion : selected.value?.publicationVersion) ?? null)
const heroDescription = computed(() => `${contextTitle.value}${selected.value ? ` · ${t('guided_help.source_guide', { id: selected.value.id })}` : ''} · ${t('guided_help.owner')}: ${ownerName.value}`)
const saveCurrent = () => isCatalog.value ? catalogForm.value?.submit() : selectedTab.value === 'general' ? guideForm.value?.submit() : saveGuide()
const publishCurrent = () => isCatalog.value ? catalogAction('publish') : guideAction('publish')
const secondaryActions = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('guided_help.preview'), icon: 'i-lucide-play', disabled: pending.value || (isCatalog.value ? !pinnedVersion.value : !document.value), onSelect: () => {
    if (isCatalog.value) previewVersion()
    else if (document.value) preview(document.value)
  } }],
  [
    ...(isCatalog.value && canEdit.value && settings.value ? [{ label: t('guided_help.clone'), icon: 'i-lucide-copy', disabled: pending.value, onSelect: () => clone(settings.value!.egcs_ay_sourceversion) }] : []),
    ...(isCatalog.value && canEdit.value && selectedCatalog.value?.publicationState === 'published' ? [{ label: t('guided_help.unpublish'), icon: 'i-lucide-eye-off', disabled: pending.value, onSelect: () => catalogAction('unpublish') }] : []),
    ...(!isCatalog.value && canDelete.value && selected.value?.capabilities?.canDelete ? [{ label: t('common.delete'), icon: 'i-lucide-trash', color: 'error' as const, disabled: pending.value, onSelect: () => guideAction('delete') }] : [])
  ]
].filter(items => items.length > 0))
watch([() => route.params.guideId, () => route.query.catalog, () => route.query.mode], () => {
  if (context.value) void loadRouteSelection().catch(showError)
})
</script>

<template>
  <CommonDetailPage id="guided-help" v-model:collapsed="collapsed" :breadcrumb-items="breadcrumbItems">
    <template #body>
      <CommonPublicationDetailHero v-if="detail" :name="selectedTitle" :description="heroDescription" icon="i-lucide-book-open" :type-label-key="isCatalog ? 'guided_help.catalog' : 'guided_help.help'" :publication-state="state ?? 'draft'" :publication-version="publicationVersion" version-label-key="guided_help.version" :has-unpublished-changes="hasUnpublishedChanges" :is-collapsed="collapsed" :is-mutation-pending="pending" :is-publishing="pendingAction === 'publish'" :is-retiring="pendingAction === 'retire'" :can-manage="canEdit && Boolean(document || settings)" :can-retire="!isCatalog && canDelete" publish-label-key="common.publish" retire-label-key="common.retire" @publish="publishCurrent" @retire="guideAction('retire')">
        <template #actions>
          <CommonSaveButton v-if="canEdit && state !== 'retired' && (document || settings)" type="button" :label="t('common.save')" color="neutral" variant="outline" :loading="pendingAction === 'save'" :disabled="pending" @click="saveCurrent" />
          <UDropdownMenu :items="secondaryActions" :content="{ align: 'end' }">
            <UButton :label="t('guided_help.more_actions')" icon="i-lucide-ellipsis" color="neutral" variant="ghost" :disabled="pending" />
          </UDropdownMenu>
        </template>
      </CommonPublicationDetailHero>
      <CommonEntityHero v-else :title="t('guided_help.title')" :description="t('guided_help.description')" icon="i-lucide-book-open" :is-collapsed="collapsed" />
      <CommonLoadingState v-if="loading" :label="t('common.loading')" />
      <UAlert v-else-if="loadError" color="error" :title="t('common.load_failed')" class="m-6">
        <template #actions>
          <UButton
            :label="t('common.retry')" @click="async () => {
              if (detail) { await reload(); await loadRouteSelection() }
              else await initialize()
            }" />
        </template>
      </UAlert>
      <GuidedHelpPublisherTable v-else-if="!detail" :groups="groups" :pending="pending" @expand="loadGroup" @create="owner => goGuide('new', owner)" @open="(owner, id) => goGuide(id, owner)" @catalog="(owner, id, catalogId) => goCatalog(id, catalogId, owner)" @clone="cloneInto" @preview="(owner, draft) => preview(draft, owner)" />
      <CommonDesignTimeEditorShell v-else-if="context && (document || settings)">
        <template #sidebar>
          <aside class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-default lg:pr-4">
            <div class="space-y-6 pt-6">
              <CommonRouteTabs v-model="selectedTab" :items="tabs" :sort="false" orientation="vertical" external-panel-id="help-editor-panel" />
              <div class="space-y-3">
                <p v-if="document" class="text-sm text-muted">
                  {{ t('guided_help.draft_explanation') }}
                </p>
              </div>
            </div>
          </aside>
        </template>
        <CommonDesignTimeEditorSections>
          <div id="help-editor-panel" role="tabpanel" :aria-label="t(selectedTabKey)" class="space-y-8">
            <p v-if="selected?.clonedFrom" class="text-sm text-muted">
              {{ t('guided_help.cloned_from') }} {{ selected.clonedFrom.ownerType === 'system' ? t('guided_help.system') : label(selected.clonedFrom.agencyName) }} · {{ t('guided_help.source_guide', { id: selected.clonedFrom.guideId }) }} · {{ t('guided_help.version_number', { number: selected.clonedFrom.version }) }}
            </p>
            <div v-if="document" class="space-y-8">
              <CommonDetailSection v-if="document && selectedTab === 'general'" :title="t(selectedTabKey)">
                <UForm ref="guideForm" :state="document" :validate="validateDraft" novalidate @submit="saveGuide" @error="focusDraftError">
                  <GuidedHelpPublisherFields v-model="document" section="general" :disabled="!canEdit || pending || state === 'retired'" @pick="pick">
                    <template #sharing>
                      <USwitch v-model="sharedOffer" :required="false" :label="t('guided_help.share_all')" :disabled="!canEdit || pending || state === 'retired'" />
                    </template>
                  </GuidedHelpPublisherFields>
                </UForm>
              </CommonDetailSection>
              <CommonDetailSection v-if="document && selectedTab === 'flow'" :title="t('guided_help.flow')" :description="t('guided_help.flow_description')">
                <GuidedHelpPublisherFlow v-model="document" v-model:selected-step="selectedStep" :disabled="!canEdit || pending || state === 'retired'" @pick="pick" />
              </CommonDetailSection>
              <CommonDetailSection v-if="selectedTab === 'history'" :title="t('guided_help.version_history')">
                <GuidedHelpPublisherHistory :versions="selected?.versions ?? []" @preview="preview" />
              </CommonDetailSection>
            </div>
            <CommonDetailSection v-if="settings" :title="t('guided_help.distribution')">
              <p v-if="selected?.clonedFrom" class="text-sm text-muted">
                {{ t('guided_help.cloned_from') }} {{ selected.clonedFrom.ownerType === 'system' ? t('guided_help.system') : label(selected.clonedFrom.agencyName) }} · {{ t('guided_help.source_guide', { id: selected.clonedFrom.guideId }) }} · {{ t('guided_help.version_number', { number: selected.clonedFrom.version }) }}
              </p>
              <p class="text-sm text-muted">
                {{ t('guided_help.distribution_hint') }}
              </p>
              <UForm ref="catalogForm" :state="settings" :validate="validateSettings" class="space-y-6" novalidate @submit="saveCatalog">
                <fieldset :disabled="!canEdit || pending" class="grid gap-6 xl:grid-cols-2">
                  <UFormField :label="t('guided_help.source_version')" required name="egcs_ay_sourceversion">
                    <USelectMenu v-model="settings.egcs_ay_sourceversion" :items="versions.map(version => ({ value: version.id, label: String(version.version) }))" value-key="value" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('guided_help.discovery_screens')" required name="egcs_ay_discoveryscreens">
                    <USelectMenu v-model="settings.egcs_ay_discoveryscreens" :items="views" value-key="value" multiple class="w-full" />
                  </UFormField>
                  <UFormField :label="t('guided_help.audience_roles')" required name="egcs_ay_roles">
                    <USelectMenu v-model="settings.egcs_ay_roles" :items="roles.map(role => ({ value: role.id, label: label(role.name) }))" value-key="value" multiple class="w-full" />
                  </UFormField>
                </fieldset>
                <section v-if="pinnedVersion" class="space-y-3 border-t border-default pt-6" :aria-label="t('guided_help.selected_source')">
                  <h3 class="text-base font-semibold">
                    {{ t('guided_help.selected_source') }} · {{ t('guided_help.version_number', { number: pinnedVersion.version }) }}
                  </h3>
                  <p class="text-sm text-muted">
                    {{ t('guided_help.version_evidence', { version: pinnedVersion.version, actor: pinnedVersion.actorId ?? '', date: pinnedVersion.publishedAt ? new Date(pinnedVersion.publishedAt).toLocaleString(locale) : '' }) }}
                  </p>
                  <p class="font-medium">
                    {{ label(pinnedVersion.document.title) }}
                  </p>
                  <p class="whitespace-pre-wrap text-muted">
                    {{ label(pinnedVersion.document.description) }}
                  </p>
                  <ol class="list-decimal space-y-2 pl-5">
                    <li v-for="step in pinnedVersion.document.steps" :key="step.id">
                      {{ label(step.title) }}
                    </li>
                  </ol>
                </section>
              </UForm>
              <div v-for="diagnostic in selectedCatalog?.compatibility" :key="diagnostic.message" role="alert">
                {{ diagnosticText(diagnostic) }}
              </div>
            </CommonDetailSection>

            <p v-if="document && selectedTab === 'history' && !selected?.versions.length" class="text-muted">
              {{ t('guided_help.no_versions') }}
            </p>
            <UAlert v-for="diagnostic in [...(selected?.compatibility ?? selectedCatalog?.compatibility ?? []), ...previewDiagnostics]" :key="diagnostic.message" color="warning" :title="diagnosticText(diagnostic)" />
          </div>
        </CommonDesignTimeEditorSections>
      </CommonDesignTimeEditorShell>
    </template>
  </CommonDetailPage>
</template>
