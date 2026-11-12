<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Catalog actions are explicit HTTP-boundary adapters. */
import GuidedHelpPublisherFlow from './PublisherFlow.vue'
import { useActionContext } from '~/composables/useActionContext'
import type { ActionContext, CapturedActionContext } from '~/composables/useActionContext'
import { useGuidedHelpRequestOwner } from '~/composables/useGuidedHelpRequestOwner'
import { useFormSession } from '~/composables/useFormSession'
import { useModalSession } from '~/composables/useModalSession'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { GuideDraftSchema, GuideDocumentSchema } from '@gcs-ssc/guided-help/contracts'
import type { ContractDiagnostic, GuideDraft } from '@gcs-ssc/guided-help/contracts'
import { blankGuide, catalogDraft, helpRequest } from '~/utils/guided-help-client'
import type { HelpAttribution, HelpCatalog, HelpGuide, HelpOption, HelpVersion } from '~/utils/guided-help-client'
import { clearHelpPicker, readHelpPicker, saveHelpPicker } from '~/utils/guided-help-picker'
import { GuidedHelpCatalogSettingsSchema } from '~~/shared/types/schemas/guided-help'
import { checkHostGuideCompatibility } from '~~/shared/guided-help/journeys'
import { guidedHelpLedger } from '#ui-targets'
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
const offers = ref<HelpGuide[]>([])
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
type PendingAction = 'save' | 'publish' | 'retire' | 'clone' | 'delete' | 'unpublish'
const initialization = useGuidedHelpRequestOwner<'initialize'>()
const loadingRequest = useGuidedHelpRequestOwner<'load'>()
const selectionRequest = useGuidedHelpRequestOwner<'select'>()
const mutationRequest = useGuidedHelpRequestOwner<PendingAction>()
const groupRequests = new Map<string, ReturnType<typeof useGuidedHelpRequestOwner<'load'>>>()
const editorEpoch = shallowRef(0)
const pendingAction = computed(() => mutationRequest.state.value.kind === 'pending' ? mutationRequest.state.value.action : null)
const pending = mutationRequest.pending
const loading = computed(() => initialization.pending.value || loadingRequest.pending.value)
const loadError = computed(() => [initialization.status.value, loadingRequest.status.value, selectionRequest.status.value].includes('error'))
watch(() => [context.value, 'guideId' in route.params ? route.params.guideId : undefined, route.query.catalog, route.query.mode], (target, previous) => {
  if (target.every((value, index) => value === previous[index])) return
  selectionRequest.reset()
  const [owner, guideId, catalogId, mode] = target
  const sameSelectedRecord = owner === previous[0] && mode === previous[3] && (mode === 'catalog'
    ? guideId === selectedCatalog.value?.egcs_ay_guide && catalogId === selectedCatalog.value?.id
    : guideId === selected.value?.id)
  if (sameSelectedRecord) return
  editorEpoch.value += 1
  mutationRequest.reset()
}, { flush: 'sync' })
const scope = computed(() => context.value === 'system' ? { type: 'global' as const } : { type: 'agency' as const, agencyId: context.value })
const canEdit = computed(() => Boolean(context.value) && can('help', 'update', scope.value))
const guideDirty = computed(() => Boolean(selected.value) && (JSON.stringify(GuideDraftSchema.safeParse(document.value).data) !== JSON.stringify(GuideDraftSchema.safeParse(selected.value?.egcs_cn_document).data) || sharedOffer.value !== selected.value?.egcs_cn_shared))
const catalogDirty = computed(() => Boolean(selectedCatalog.value?.id) && JSON.stringify(settings.value) !== JSON.stringify(catalogDraft(selectedCatalog.value!)))
const canDelete = computed(() => Boolean(context.value) && can('help', 'delete', scope.value))
const editorIdentity = [() => context.value, () => editorEpoch.value]
const updateContext = useActionContext({
  identity: editorIdentity,
  authority: canEdit,
  eligible: () => selectedCatalog.value !== null || (document.value !== null && selected.value?.publicationState !== 'retired')
})
const retireContext = useActionContext({
  identity: editorIdentity,
  authority: canDelete,
  eligible: () => selected.value !== null && selected.value.publicationState !== 'retired'
})
const retirementKey = retireContext.version
const deleteContext = useActionContext({
  identity: editorIdentity,
  authority: canDelete,
  eligible: () => selected.value?.capabilities?.canDelete === true
})
const canCopyInto = (owner: string) => can('help', 'update', { type: 'agency', agencyId: owner })
const copyDestination: Ref<string | null> = ref(null)
const copyContext = useActionContext({
  identity: [...editorIdentity, () => copyDestination.value],
  authority: () => copyDestination.value !== null && canCopyInto(copyDestination.value)
})
const agencyId = computed(() => context.value && context.value !== 'system' ? context.value : null)
const ownedEndpoint = computed(() => `/api/guided-help${agencyId.value ? `?agencyId=${agencyId.value}` : ''}`)
const catalogEndpoint = computed(() => `/api/agency/${agencyId.value}/guided-help`)
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const newestVersion = (guide: HelpGuide) => [...guide.versions].sort((left, right) => right.version - left.version)[0]
const views = computed(() => guidedHelpLedger.views.filter(view => view.discoverable !== false).map(view => ({ value: view.key, label: label(view.label) })))
const resetSelection = () => {
  selectionRequest.reset()
  previewDiagnostics.value = []
  selected.value = null
  document.value = null
  selectedCatalog.value = null
  settings.value = null
  versions.value = []
}
const reload = async () => {
  loadingRequest.reset()
  resetSelection()
  guides.value = []
  catalogs.value = []
  shared.value = []
  roles.value = []
  if (!context.value) return
  const request = loadingRequest.begin('load')
  if (!request) return
  try {
    const [owned, catalog, library, roleOptions] = await Promise.all([
      helpRequest<{ items: HelpGuide[] }>(ownedEndpoint.value),
      agencyId.value ? helpRequest<{ items: HelpCatalog[] }>(catalogEndpoint.value) : Promise.resolve({ items: [] }),
      agencyId.value ? helpRequest<{ items: { id: string, document: GuideDraft, sourceVersionId: string, version: number, sourceAttribution?: HelpAttribution }[] }>(`/api/guided-help/shared?agencyId=${agencyId.value}`) : Promise.resolve({ items: [] }),
      agencyId.value ? helpRequest<{ items: HelpOption[] }>(`${catalogEndpoint.value}/roles`) : Promise.resolve({ items: [] })
    ])
    if (!loadingRequest.isCurrent(request)) return
    guides.value = owned.items
    catalogs.value = catalog.items
    shared.value = library.items.map(item => ({ id: item.id, sourceAttribution: item.sourceAttribution, egcs_cn_document: item.document, egcs_cn_shared: true, versions: [{ id: item.sourceVersionId, version: item.version, document: item.document as HelpVersion['document'] }] }))
    roles.value = roleOptions.items
    loadingRequest.succeed(request)
  } catch (error) {
    if (loadingRequest.fail(request, error)) showError(error)
  }
}
watch(context, () => loadingRequest.reset(), { flush: 'sync' })
watch(context, async () => {
  if (detail) return
  const epoch = editorEpoch.value
  await reload()
  if (epoch === editorEpoch.value) await router.replace({ path: route.path, query: { ...route.query, context: context.value || undefined } })
})
onBeforeUnmount(() => {
  editorEpoch.value += 1
  for (const request of groupRequests.values()) request.dispose()
})
const initialize = async () => {
  const request = initialization.begin('initialize')
  if (!request) return
  try {
    const options = await helpRequest<{ items: HelpOption[], canSystem: boolean }>('/api/guided-help/contexts')
    if (!initialization.isCurrent(request)) return
    contexts.value = options.items
    canSystem.value = options.canSystem
    if (!detail) {
      for (const owner of groupRequests.values()) owner.dispose()
      groupRequests.clear()
      groups.value = [...(options.canSystem ? [{ id: 'system', name: { en: '', fr: '' } }] : []), ...options.items].map(item => {
        const owner = useGuidedHelpRequestOwner<'load'>()
        groupRequests.set(item.id, owner)
        return {
          ...item, guides: [], catalogs: [],
          get loaded() { return owner.status.value === 'success' },
          get loading() { return owner.pending.value },
          get error() { return owner.status.value === 'error' },
          canEdit: can('help', 'update', item.id === 'system' ? { type: 'global' } : { type: 'agency', agencyId: item.id })
        }
      })
      const agency = options.items[0]
      const availableOffers: HelpGuide[] = agency ? (await helpRequest<{ items: { id: string, document: GuideDraft, sourceVersionId: string, version: number, sourceAttribution?: HelpAttribution }[] }>(`/api/guided-help/shared?agencyId=${agency.id}`)).items.map(item => ({ id: item.id, sourceAttribution: item.sourceAttribution, egcs_cn_document: item.document, egcs_cn_shared: true, publicationState: 'published', versions: [{ id: item.sourceVersionId, version: item.version, document: item.document as HelpVersion['document'] }] })) : []
      if (!initialization.isCurrent(request)) return
      offers.value = availableOffers
    }
    const picking = user.value?.id ? readHelpPicker(user.value.id) : null
    if (picking && !detail) {
      await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(picking.guide?.id ?? 'new'), query: { context: picking.context, section: 'flow' } }))
      return
    }
    const requestedContext = detail && typeof route.query.context === 'string' ? route.query.context : ''
    if (!picking && requestedContext && (requestedContext === 'system' ? options.canSystem : options.items.some(item => item.id === requestedContext))) {
      context.value = requestedContext
      const epoch = editorEpoch.value
      await reload()
      if (!initialization.isCurrent(request) || epoch !== editorEpoch.value) return
      await loadRouteSelection()
    }
    if (picking && (picking.context === 'system' ? options.canSystem : options.items.some(item => item.id === picking.context))) {
      context.value = picking.context
      const epoch = editorEpoch.value
      await reload()
      if (!initialization.isCurrent(request) || epoch !== editorEpoch.value) return
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
    if (initialization.fail(request, error)) showError(error)
  } finally { initialization.succeed(request) }
}
onMounted(initialize)
const mutate = async (kind: PendingAction, action: (operation: CapturedActionContext, current: () => boolean, canContinue: () => boolean) => Promise<void>, actionContext: ActionContext = updateContext) => {
  if (pending.value) return
  const operation = actionContext.capture()
  if (!operation) return
  const request = mutationRequest.begin(kind)
  if (!request) return
  const epoch = editorEpoch.value
  const current = () => mutationRequest.isCurrent(request) && editorEpoch.value === epoch && operation.isCurrent()
  const canContinue = () => current() && operation.canDispatch()
  try {
    await action(operation, current, canContinue)
    mutationRequest.succeed(request)
  } catch (error) {
    if (current() && mutationRequest.fail(request, error)) showError(error)
    else mutationRequest.succeed(request)
  }
}
const openGuide = async (guide: HelpGuide) => {
  const request = selectionRequest.begin('select')
  if (!request) return
  try {
    const detail = await helpRequest<HelpGuide>(`/api/guided-help/${guide.id}`)
    if (!selectionRequest.succeed(request)) return
    selectedCatalog.value = null
    settings.value = null
    selected.value = detail
    document.value = structuredClone(detail.egcs_cn_document)
    sharedOffer.value = detail.egcs_cn_shared
  } catch (error) {
    if (selectionRequest.fail(request, error)) showError(error)
  }
}
const createGuide = () => {
  resetSelection()
  document.value = blankGuide()
  sharedOffer.value = false
}
const persistGuide = async (current: () => boolean, canContinue: () => boolean): Promise<boolean> => {
  if (!document.value || !canContinue()) return false
  const body = { egcs_cn_document: JSON.parse(JSON.stringify(document.value)), egcs_cn_shared: sharedOffer.value }
  const endpoint = selected.value ? `/api/guided-help/${selected.value.id}` : ownedEndpoint.value
  const method = selected.value ? 'PATCH' : 'POST'
  const errors = await validateDraft(body.egcs_cn_document)
  if (!canContinue()) return false
  if (errors.length) {
    focusDraftError({ errors })
    showError(new Error(errors[0]!.message))
    return false
  }
  const result = await helpRequest<HelpGuide>(endpoint, method, body)
  if (!current()) return false
  const unchanged = JSON.stringify(document.value) === JSON.stringify(body.egcs_cn_document) && sharedOffer.value === body.egcs_cn_shared
  selected.value = result
  if (unchanged) document.value = structuredClone(result.egcs_cn_document)
  if (('guideId' in route.params ? route.params.guideId : undefined) === 'new') await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(result.id), query: { context: context.value, section: selectedTab.value } }))
  if (!current()) return false
  const index = guides.value.findIndex(guide => guide.id === result.id)
  if (index < 0) guides.value.push(result)
  else guides.value[index] = result
  return true
}
const saveGuide = () => mutate('save', async (_operation, current, canContinue) => {
  await persistGuide(current, canContinue)
})
const guideAction = (action: 'publish' | 'retire' | 'delete') => mutate(action, async (operation, current, canContinue) => {
  if (action === 'retire' && guideDirty.value) {
    showError(new Error(t('common.save_changes_before_action')))
    return
  }
  if (action === 'publish') {
    if (!document.value || !canContinue()) return
    const errors = await validatePublication(document.value)
    if (!canContinue()) return
    if (errors.length) {
      focusDraftError({ errors })
      await nextTick()
      if (!canContinue()) return
      guideForm.value?.setErrors(errors)
      showError(new Error(errors[0]!.message))
      return
    }
    if ((!selected.value || guideDirty.value) && !await persistGuide(current, canContinue)) return
    if (guideDirty.value) return
  }
  if (!canContinue() || !selected.value) return
  const targetId = selected.value.id
  if (action === 'delete') {
    if (!await confirmDeleteRequest(`/api/guided-help/${targetId}`, {
      operation,
      target: {
        id: targetId,
        resolve: () => selected.value?.id === targetId ? selected.value : null,
        eligible: guide => guide.capabilities?.canDelete === true
      },
      shouldProceed: () => current() && selected.value?.id === targetId && selected.value.capabilities?.canDelete === true
    })) return
  } else await helpRequest(`/api/guided-help/${targetId}/${action}`, 'POST')
  if (!current()) return
  await reload()
  if (!current()) return
  if (action === 'delete') await goIndex()
  else await loadRouteSelection()
}, action === 'delete' ? deleteContext : action === 'retire' ? retireContext : updateContext)
const openCatalog = async (catalog: HelpCatalog) => {
  const request = selectionRequest.begin('select')
  if (!request) return
  try {
    const detail = await helpRequest<HelpCatalog>(`${catalogEndpoint.value}/${catalog.id}`)
    if (!selectionRequest.succeed(request)) return
    selected.value = null
    document.value = null
    selectedCatalog.value = detail
    settings.value = catalogDraft(detail)
    // Offered sources and owned sources expose only the versions the actor may inspect.
    const source = [...guides.value, ...shared.value].find(guide => guide.id === detail.egcs_ay_guide)
    versions.value = detail.sourceVersions ?? source?.versions ?? []
  } catch (error) {
    if (selectionRequest.fail(request, error)) showError(error)
  }
}
const adopt = (guide: HelpGuide) => {
  selectionRequest.reset()
  const version = newestVersion(guide)
  if (!version) return
  selected.value = null
  document.value = null
  selectedCatalog.value = { id: '', egcs_ay_enabled: false, sourceVersionDocument: version.document, egcs_ay_guide: guide.id, egcs_ay_sourceversion: version.id, egcs_ay_discoveryscreens: [], egcs_ay_roles: [] }
  settings.value = catalogDraft(selectedCatalog.value)
  versions.value = guide.versions
}
const persistCatalog = async (current: () => boolean, canContinue: () => boolean): Promise<boolean> => {
  if (!selectedCatalog.value || !settings.value || !canContinue()) return false
  const body = { ...(!selectedCatalog.value.id ? { egcs_ay_guide: selectedCatalog.value.egcs_ay_guide } : {}), ...JSON.parse(JSON.stringify(settings.value)) }
  const snapshot = JSON.stringify(settings.value)
  const endpoint = `${catalogEndpoint.value}${selectedCatalog.value.id ? `/${selectedCatalog.value.id}` : ''}`
  const method = selectedCatalog.value.id ? 'PATCH' : 'POST'
  const errors = await validateSettings(settings.value)
  if (!canContinue()) return false
  if (errors.length) {
    catalogForm.value?.setErrors(errors)
    return false
  }
  const result = await helpRequest<HelpCatalog>(endpoint, method, body)
  if (!current()) return false
  selectedCatalog.value = result
  if (JSON.stringify(settings.value) === snapshot) settings.value = catalogDraft(result)
  const index = catalogs.value.findIndex(item => item.id === result.id)
  if (index < 0) catalogs.value.push(result)
  else catalogs.value[index] = result
  await router.replace(localePath({ ...appRouteLocations.guidedHelpDetail(result.egcs_ay_guide), query: { context: context.value, mode: 'catalog', catalog: result.id } }))
  return current()
}
const saveCatalog = () => mutate('save', async (_operation, current, canContinue) => {
  await persistCatalog(current, canContinue)
})
const formOwner = useModalSession()
watch([editorEpoch, document, settings], () => {
  formOwner.isOpen.value = false
  formOwner.isOpen.value = document.value !== null || settings.value !== null
}, { immediate: true, flush: 'sync' })
const guideFormSession = useFormSession({ owner: formOwner, action: { kind: 'remote', context: updateContext }, submit: saveGuide })
const catalogFormSession = useFormSession({ owner: formOwner, action: { kind: 'remote', context: updateContext }, submit: saveCatalog })
const catalogAction = (action: 'publish' | 'unpublish') => mutate(action, async (_operation, current, canContinue) => {
  if (action === 'unpublish' && catalogDirty.value) {
    showError(new Error(t('common.save_changes_before_action')))
    return
  }
  if (action === 'publish' && (!selectedCatalog.value?.id || catalogDirty.value) && !await persistCatalog(current, canContinue)) return
  if (!canContinue() || !selectedCatalog.value?.id || catalogDirty.value) return
  await helpRequest(`${catalogEndpoint.value}/${selectedCatalog.value.id}/${action}`, 'POST')
  if (!current()) return
  await reload()
  if (current()) await loadRouteSelection()
})
const clone = (versionId: string) => mutate('clone', async (_operation, current) => {
  const result = await helpRequest<HelpGuide>(`${catalogEndpoint.value}/clone`, 'POST', { sourceVersionId: versionId })
  if (current()) await goGuide(result.id)
})
const preview = (draft: GuideDraft, previewContext = context.value) => {
  const parsed = GuideDocumentSchema.safeParse(draft)
  previewDiagnostics.value = parsed.success ? checkHostGuideCompatibility(parsed.data, guidedHelpLedger) : []
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
  const owner = groupRequests.get(id)
  const request = owner?.begin('load')
  if (!owner || !request) return
  try {
    const [owned, catalog] = await Promise.all([
      helpRequest<{ items: HelpGuide[] }>(`/api/guided-help${id === 'system' ? '' : `?agencyId=${id}`}`),
      id === 'system' ? Promise.resolve({ items: [] }) : helpRequest<{ items: HelpCatalog[] }>(`/api/agency/${id}/guided-help`)
    ])
    if (!owner.isCurrent(request)) return
    group.guides = owned.items
    group.catalogs = catalog.items
    owner.succeed(request)
  } catch (error) {
    if (owner.fail(request, error)) showError(error)
  }
}
const cloneInto = (ownerContext: string, versionId: string) => {
  if (pending.value) return
  copyDestination.value = ownerContext
  return mutate('clone', async (_operation, current) => {
    const result = await helpRequest<HelpGuide>(`/api/agency/${ownerContext}/guided-help/clone`, 'POST', { sourceVersionId: versionId })
    if (current()) await goGuide(result.id, ownerContext)
  }, copyContext)
}
const loadRouteSelection = async () => {
  if (!detail || !context.value) return
  const id = String(('guideId' in route.params ? route.params.guideId : undefined))
  if (route.query.mode === 'catalog') {
    if (typeof route.query.catalog === 'string') {
      const entry = catalogs.value.find(item => item.id === route.query.catalog)
      if (entry) await openCatalog(entry)
      else {
        const request = selectionRequest.begin('select')
        if (request) selectionRequest.fail(request, new Error('Guide selection unavailable'))
      }
    } else {
      const existing = catalogs.value.find(item => item.egcs_ay_guide === id)
      const guide = [...guides.value, ...shared.value].find(item => item.id === id)
      if (existing) await openCatalog(existing)
      else if (guide) adopt(guide)
      else {
        const request = selectionRequest.begin('select')
        if (request) selectionRequest.fail(request, new Error('Guide selection unavailable'))
      }
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
const state = computed(() => isCatalog.value ? selectedCatalog.value?.egcs_ay_enabled === false ? 'draft' : selectedCatalog.value?.publicationState : selected.value?.publicationState)
const hasUnpublishedChanges = computed(() => isCatalog.value ? catalogDirty.value || selectedCatalog.value?.hasUnpublishedChanges === true : guideDirty.value || selected.value?.hasUnpublishedChanges === true)
const publicationVersion = computed(() => (isCatalog.value ? selectedCatalog.value?.publicationVersion : selected.value?.publicationVersion) ?? null)
const heroDescription = computed(() => `${contextTitle.value}${selected.value ? ` · ${t('guided_help.source_guide', { id: selected.value.id })}` : ''} · ${t('guided_help.owner')}: ${ownerName.value}`)
const saveCurrent = () => isCatalog.value ? catalogForm.value?.submit() : selectedTab.value === 'general' ? guideForm.value?.submit() : saveGuide()
const publishCurrent = () => isCatalog.value ? catalogAction('publish') : guideAction('publish')
const previewCurrent = () => {
  if (isCatalog.value) previewVersion()
  else if (document.value) preview(document.value)
}
const secondaryActions = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('guided_help.preview'), icon: 'i-lucide-play', disabled: pending.value || (isCatalog.value ? !pinnedVersion.value : !document.value), onSelect: previewCurrent }],
  [
    ...(isCatalog.value && canEdit.value && settings.value ? [{ label: t('guided_help.clone'), icon: 'i-lucide-copy', disabled: pending.value, onSelect: () => clone(settings.value!.egcs_ay_sourceversion) }] : []),
    ...(isCatalog.value && canEdit.value && state.value === 'published' ? [{ label: t('guided_help.unpublish'), icon: 'i-lucide-eye-off', disabled: pending.value, onSelect: () => catalogAction('unpublish') }] : []),
    ...(!isCatalog.value && canDelete.value && selected.value?.capabilities?.canDelete ? [{ label: t('common.delete'), icon: 'i-lucide-trash', color: 'error' as const, disabled: pending.value, onSelect: () => guideAction('delete') }] : [])
  ]
].filter(items => items.length > 0))
watch([() => ('guideId' in route.params ? route.params.guideId : undefined), () => route.query.catalog, () => route.query.mode, () => route.query.context], async (target, previous) => {
  if (!detail) return
  const requestedOwner = typeof route.query.context === 'string' ? route.query.context : ''
  const authorizedOwner = requestedOwner === 'system' ? canSystem.value : contexts.value.some(owner => owner.id === requestedOwner)
  if (!authorizedOwner) {
    context.value = ''
    await reload()
    return
  }
  if (context.value !== requestedOwner) {
    context.value = requestedOwner
    const epoch = editorEpoch.value
    await reload()
    if (epoch !== editorEpoch.value) return
  }
  const canonicalGuide = previous[0] === 'new' && target[0] === selected.value?.id
  const canonicalCatalog = previous[1] === undefined && target[1] === selectedCatalog.value?.id && target[0] === selectedCatalog.value?.egcs_ay_guide
  if (context.value && !(target[3] === previous[3] && target[2] === previous[2] && (canonicalGuide || canonicalCatalog))) await loadRouteSelection()
}, { flush: 'sync' })
</script>

<template>
  <CommonDetailPage id="guided-help" v-model:collapsed="collapsed" :breadcrumb-items="breadcrumbItems" data-field-scope="guided-help.manager" data-field-tooltip-unavailable="No owning agency is resolved for this administration screen.">
    <template #body>
      <CommonPublicationDetailHero v-if="detail" :key="`retirement-${retirementKey}`" :action-context="retireContext" :name="selectedTitle" :description="heroDescription" icon="i-lucide-book-open" :type-label-key="isCatalog ? 'guided_help.catalog' : 'guided_help.help'" :publication-state="state ?? 'draft'" :publication-version="publicationVersion" version-label-key="guided_help.version" :has-unpublished-changes="hasUnpublishedChanges" :is-collapsed="collapsed" :is-mutation-pending="pending" :is-publishing="pendingAction === 'publish'" :is-retiring="pendingAction === 'retire'" :can-manage="canEdit && Boolean(document || settings)" :can-retire="!isCatalog && canDelete" publish-label-key="common.publish" retire-label-key="common.retire" @publish="publishCurrent" @retire="guideAction('retire')">
        <template #actions>
          <CommonSaveButton v-if="canEdit && state !== 'retired' && (document || settings)" type="button" :label="t('common.save')" color="neutral" variant="outline" :loading="pendingAction === 'save'" :disabled="pending" @click="saveCurrent" />
          <UButton v-if="secondaryActions.flat().length === 1" :label="t('guided_help.preview')" icon="i-lucide-play" color="neutral" variant="outline" :disabled="pending || (isCatalog ? !pinnedVersion : !document)" @click="previewCurrent" />
          <UDropdownMenu v-else :items="secondaryActions" :content="{ align: 'end' }">
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
      <GuidedHelpPublisherTable v-else-if="!detail" :groups="groups" :offers="offers" :pending="pending" @expand="loadGroup" @create="owner => goGuide('new', owner)" @open="(owner, id) => goGuide(id, owner)" @catalog="(owner, id, catalogId) => goCatalog(id, catalogId, owner)" @clone="cloneInto" @preview="(owner, draft) => preview(draft, owner)" />
      <CommonDesignTimeEditorShell v-else-if="context && (document || settings)">
        <template #sidebar>
          <aside class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-default lg:pr-4">
            <div class="space-y-6 pt-6">
              <CommonTranslatedTabs v-model="selectedTab" ordering="authored" data-field-container="Page navigation state, not a business input field." :items="tabs" orientation="vertical" external-panel-id="help-editor-panel" />
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
                <UForm ref="guideForm" v-bind="guideFormSession" :state="document" :validate="validateDraft" novalidate @error="focusDraftError">
                  <GuidedHelpPublisherFields v-model="document" data-field-container="Composite editor; its individual field declarations own their identities." section="general" :disabled="!canEdit || pending || state === 'retired'" @pick="pick">
                    <template #sharing>
                      <USwitch v-model="sharedOffer" :required="false" :label="t('guided_help.share_all')" :disabled="!canEdit || pending || state === 'retired'" data-ui-target="guided-help.manager.sharedOffer" />
                    </template>
                  </GuidedHelpPublisherFields>
                </UForm>
              </CommonDetailSection>
              <CommonDetailSection v-if="document && selectedTab === 'flow'" :title="t('guided_help.flow')" :description="t('guided_help.flow_description')">
                <GuidedHelpPublisherFlow v-model="document" v-model:selected-step="selectedStep" data-field-container="Composite editor; its individual field declarations own their identities." :disabled="!canEdit || pending || state === 'retired'" @pick="pick" />
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
              <UForm ref="catalogForm" v-bind="catalogFormSession" :state="settings" :validate="validateSettings" class="space-y-6" novalidate>
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
