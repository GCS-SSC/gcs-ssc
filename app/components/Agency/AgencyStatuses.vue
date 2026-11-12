<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Local UI event handlers are described by their names and focused tests. */
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type { Ref } from 'vue'
import { StatusDefinitionCreateSchema, type StatusDefinitionInput } from '~~/shared/types/schemas'
import type { StatusDefinition } from '~~/shared/types/status'
import type { AgencyClaimReconciliationStatusConfiguration } from '~~/shared/types/schemas/agency'
import { useStatusCatalog } from '~/composables/useStatusCatalog'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'

type StatusLifecycle = 'normal' | 'readOnly' | 'terminal'
type ReconciliationSaveState = { kind: 'idle' } | { kind: 'saving', request: symbol } | { kind: 'disposed' }

const { agencyId, canCreate, canUpdate, canDelete, showHeader = true, reconciliationPendingRequests } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean, showHeader?: boolean, reconciliationPendingRequests: Map<string, symbol> }>()
const { locale, t } = useI18n()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const confirmDelete = useDeleteConfirm()
const catalog = useStatusCatalog()
const canEdit = computed(() => canUpdate)
const canManageFlags = computed(() => canDelete)
const definitions = computed(() => catalog.getForAgency(agencyId, true))
const modal = useModalSession()
const isOpen = modal.isOpen
const selectedId: Ref<string | null> = ref(null)
const createActionContext = useActionContext({ identity: [() => agencyId], authority: () => canCreate })
const updateActionContext = useActionContext({
  identity: [() => agencyId], authority: () => canUpdate,
  eligible: () => definitions.value.some(row => row.id === selectedId.value && !row.isDraft)
})
const formActionContext = () => selectedId.value ? updateActionContext : createActionContext
const deleteActionContext = useActionContext({ identity: [() => agencyId], authority: () => canDelete })
const reconciliationActionContext = useActionContext({ identity: [() => agencyId], authority: () => canUpdate })
const modalPending = useCrudModalPending(modal.captureSession)
const pending = modalPending.isPending
const pendingActionId: Ref<string | null> = ref(null)
const reconciliationStatuses: Ref<AgencyClaimReconciliationStatusConfiguration> = ref({ startStatusId: null, finalStatusId: null })
const acceptedReconciliationStatuses: Ref<{ agencyId: string, value: AgencyClaimReconciliationStatusConfiguration } | null> = ref(null)
const reconciliationSaveState: Ref<ReconciliationSaveState> = ref({ kind: 'idle' })
const reconciliationReadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
const reconciliationStatusesPending = computed(() => reconciliationPendingRequests.has(agencyId))
const state: Ref<StatusDefinitionInput> = ref({ nameEn: '', nameFr: '', color: '#64748b', icon: 'i-lucide-circle', readOnly: false, terminal: false })
const lifecycle: Ref<StatusLifecycle> = ref('normal')
const terminalLocked: Ref<boolean> = ref(false)
const { createValidator } = useZodI18n()
const validate = createValidator(StatusDefinitionCreateSchema)
const lifecycleOptions = computed(() => [
  { value: 'normal', label: t('agency.statuses.lifecycle_normal'), description: t('agency.statuses.lifecycle_normal_description'), disabled: terminalLocked.value },
  { value: 'readOnly', label: t('agency.statuses.lifecycle_read_only'), description: t('agency.statuses.lifecycle_read_only_description'), disabled: terminalLocked.value },
  { value: 'terminal', label: t('agency.statuses.lifecycle_terminal'), description: t('agency.statuses.lifecycle_terminal_description') }
])
const previewLabel = computed(() => locale.value === 'fr' ? state.value.nameFr : state.value.nameEn)
let agencyRefreshGeneration = 0
let disposed = false
let reconciliationGeneration = 0
let reconciliationDraftVersion = 0
let reconciliationRead: symbol | null = null
const isCurrentContext = (generation: number) => !disposed && generation === agencyRefreshGeneration
watch([
  () => reconciliationStatuses.value.startStatusId,
  () => reconciliationStatuses.value.finalStatusId
], () => {
  reconciliationDraftVersion += 1
}, { flush: 'sync' })
watch([() => canCreate, () => canUpdate, () => canDelete], () => {
  isOpen.value = false
}, { flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  agencyRefreshGeneration += 1
  reconciliationRead = null
  reconciliationSaveState.value = { kind: 'disposed' }
})

const refreshReconciliationStatuses = async (requestedAgencyId: string, generation: number) => {
  const request = Symbol('reconciliation-read')
  reconciliationRead = request
  reconciliationReadStatus.value = 'pending'
  const draftVersion = reconciliationDraftVersion
  const isCurrent = () => !disposed && generation === reconciliationGeneration && reconciliationRead === request
  try {
    const response = await fetch(getClientRequestUrl(`/api/agency/${requestedAgencyId}/claim-reconciliation-statuses`))
    if (!response.ok) await throwFetchResponseError(response)
    const nextStatuses = await response.json() as AgencyClaimReconciliationStatusConfiguration
    if (!isCurrent()) return
    reconciliationReadStatus.value = 'success'
    acceptedReconciliationStatuses.value = { agencyId: requestedAgencyId, value: { ...nextStatuses } }
    if (draftVersion === reconciliationDraftVersion) reconciliationStatuses.value = nextStatuses
  } catch (error: unknown) {
    if (isCurrent()) {
      reconciliationReadStatus.value = 'error'
      showError(error)
    }
  } finally {
    if (reconciliationRead === request) reconciliationRead = null
  }
}
const retryReconciliationStatuses = () => {
  if (disposed || reconciliationRead !== null) return
  return refreshReconciliationStatuses(agencyId, reconciliationGeneration)
}

watch(() => agencyId, requestedAgencyId => {
  const generation = ++agencyRefreshGeneration
  pendingActionId.value = null
  isOpen.value = false
  selectedId.value = null

  void catalog.refreshAgency(requestedAgencyId).catch(error => {
    if (isCurrentContext(generation) && requestedAgencyId === agencyId) showError(error)
  })
}, { immediate: true, flush: 'sync' })

watch(reconciliationActionContext.version, () => {
  const requestedAgencyId = agencyId
  const generation = ++reconciliationGeneration
  acceptedReconciliationStatuses.value = null
  reconciliationStatuses.value = { startStatusId: null, finalStatusId: null }
  reconciliationSaveState.value = { kind: 'idle' }
  void refreshReconciliationStatuses(requestedAgencyId, generation)
}, { immediate: true, flush: 'sync' })

const saveReconciliationStatuses = async () => {
  const operation = reconciliationActionContext.capture()
  if (!operation?.canDispatch()) return
  if (disposed || !canUpdate || reconciliationStatusesPending.value) return
  if (acceptedReconciliationStatuses.value?.agencyId !== agencyId) {
    toast.add({
      title: toast.localized('common.unavailable'),
      description: toast.localized(reconciliationReadStatus.value === 'pending' ? 'common.loading' : 'common.configuration_load_failed_description'),
      color: 'warning'
    })
    return
  }
  const requestedAgencyId = agencyId
  const generation = reconciliationGeneration
  const request = Symbol('reconciliation-save')
  const draftVersion = reconciliationDraftVersion
  const draft = { ...reconciliationStatuses.value }
  const isCurrent = () => operation.isCurrent() && !disposed && generation === reconciliationGeneration
    && reconciliationSaveState.value.kind === 'saving' && reconciliationSaveState.value.request === request
  reconciliationRead = null
  reconciliationPendingRequests.set(requestedAgencyId, request)
  reconciliationSaveState.value = { kind: 'saving', request }
  try {
    const response = await fetch(getClientRequestUrl(`/api/agency/${agencyId}/claim-reconciliation-statuses`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft)
    })
    if (!response.ok) await throwFetchResponseError(response)
    const savedStatuses = await response.json() as AgencyClaimReconciliationStatusConfiguration
    if (!isCurrent()) return
    acceptedReconciliationStatuses.value = { agencyId: requestedAgencyId, value: { ...savedStatuses } }
    if (draftVersion === reconciliationDraftVersion) reconciliationStatuses.value = savedStatuses
    toast.add({ title: toast.localized('common.success'), description: toast.localized('agency.statuses.reconciliation_saved'), color: 'success' })
  } catch (error: unknown) {
    if (isCurrent()) showError(error)
  } finally {
    if (reconciliationPendingRequests.get(requestedAgencyId) === request) reconciliationPendingRequests.delete(requestedAgencyId)
    if (reconciliationSaveState.value.kind === 'saving' && reconciliationSaveState.value.request === request) {
      reconciliationSaveState.value = { kind: 'idle' }
    }
  }
}

const getLifecycle = (definition: StatusDefinition): StatusLifecycle => definition.terminal
  ? 'terminal'
  : definition.readOnly ? 'readOnly' : 'normal'

const openCreate = () => {
  if (disposed || !canCreate) return
  isOpen.value = false
  selectedId.value = null
  state.value = { nameEn: '', nameFr: '', color: '#64748b', icon: 'i-lucide-circle', readOnly: false, terminal: false }
  lifecycle.value = 'normal'
  terminalLocked.value = false
  isOpen.value = true
}
const openEdit = (definition: StatusDefinition) => {
  if (disposed || !canUpdate || definition.isDraft) return
  isOpen.value = false
  selectedId.value = definition.id
  state.value = { nameEn: definition.nameEn, nameFr: definition.nameFr, color: definition.color, icon: definition.icon, readOnly: definition.readOnly, terminal: definition.terminal }
  lifecycle.value = getLifecycle(definition)
  terminalLocked.value = definition.terminal
  isOpen.value = true
}
const save = async () => {
  const operation = formActionContext().capture()
  if (!operation?.canDispatch()) return
  const requestSession = modal.captureSession()
  const generation = agencyRefreshGeneration
  const requestedAgencyId = agencyId
  const updating = selectedId.value !== null
  if (disposed || requestSession === null || (updating ? !canUpdate : !canCreate) || !modalPending.begin(requestSession)) return
  const statusId = selectedId.value
  const ownsEditor = () => operation.isCurrent() && isCurrentContext(generation) && modal.isCurrentSession(requestSession)
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && isCurrentContext(generation) && (modal.isCurrentSession(requestSession) || (closed && modal.isLatestSession(requestSession)))
  try {
    const url = updating ? `/api/agency/statuses/${statusId}` : `/api/agency/${requestedAgencyId}/statuses`
    const presentation = {
      nameEn: state.value.nameEn,
      nameFr: state.value.nameFr,
      color: state.value.color,
      icon: state.value.icon
    }
    const body = canManageFlags.value
      ? {
          ...presentation,
          readOnly: lifecycle.value === 'readOnly',
          terminal: lifecycle.value === 'terminal'
        }
      : presentation
    const response = await fetch(getClientRequestUrl(url), { method: updating ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent() || !isCurrentContext(generation)) return
    if (ownsEditor()) {
      isOpen.value = false
      closed = true
    }
    if (ownsFeedback()) toast.add({ title: toast.localized('common.success'), description: toast.localized(updating ? 'common.updated_success' : 'common.created_success'), color: 'success' })
    try {
      await catalog.refreshAgency(requestedAgencyId)
    } catch (refreshError) {
      if (ownsFeedback()) showError(refreshError)
    }
  } catch (error: unknown) {
    if (ownsFeedback()) showError(error)
  } finally {
    modalPending.end(requestSession)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: formActionContext }, submit: save })
const setDeleted = async (definition: StatusDefinition, deleted: boolean) => {
  if (disposed || !canDelete || definition.isDraft || pendingActionId.value !== null) return
  const operation = deleteActionContext.capture()
  if (!operation?.canDispatch()) return
  const generation = agencyRefreshGeneration
  const requestedAgencyId = agencyId
  const isCurrent = () => operation.isCurrent() && isCurrentContext(generation)
  const id = definition.id
  let eligible = true
  const stopTarget = watch(() => definitions.value.some(row => row.id === id && !row.isDraft && row.deleted !== deleted), value => {
    if (!value) eligible = false
  }, { immediate: true, flush: 'sync' })
  const canDispatch = () => eligible && operation.canDispatch() && isCurrentContext(generation)
  const localizedName = locale.value === 'fr'
    ? definition.nameFr
    : definition.nameEn
  pendingActionId.value = id
  try {
    if (deleted && !await confirmDelete({ description: t('agency.statuses.delete_confirmation', { name: localizedName }) })) return
    if (!canDispatch()) return
    const response = await fetch(getClientRequestUrl(`/api/agency/statuses/${id}/${deleted ? 'delete' : 'restore'}`), { method: 'POST' })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrent()) return
    toast.add({ title: toast.localized('common.success'), description: toast.localized(deleted ? 'agency.statuses.deleted_success' : 'agency.statuses.restored_success'), color: 'success' })
    try {
      await catalog.refreshAgency(requestedAgencyId)
    } catch (refreshError) {
      if (isCurrent()) showError(refreshError)
    }
  } catch (error: unknown) {
    if (isCurrent()) showError(error)
  } finally {
    stopTarget()
    if (isCurrentContext(generation) && pendingActionId.value === id) pendingActionId.value = null
  }
}
</script>

<template>
  <section class="space-y-4" data-field-scope="agency.statuses">
    <div class="flex items-center justify-between">
      <div>
        <h2 v-if="showHeader" class="text-xl font-semibold">
          {{ t('agency.statuses.title') }}
        </h2>
        <p class="text-sm text-zinc-500">
          {{ t('agency.statuses.description') }}
        </p>
      </div>
      <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('agency.statuses.add')" @click="openCreate" />
    </div>
    <div class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <div v-for="definition in definitions" :key="definition.id" class="flex flex-wrap items-center gap-3 px-4 py-3" :class="{ 'opacity-60': definition.deleted }">
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <CommonStatusBadge :status-id="definition.id" />
            <CommonStatusBadge v-if="definition.isDraft" variant="meta" :label="t('agency.statuses.protected')" />
            <CommonStatusBadge v-else-if="definition.terminal" variant="unsuccessful" :label="t('agency.statuses.terminal')" />
            <CommonStatusBadge v-else-if="definition.readOnly" variant="meta" :label="t('agency.statuses.read_only')" />
            <CommonStatusBadge v-else variant="meta" :label="t('agency.statuses.normal')" />
            <CommonStatusBadge v-if="definition.deleted" variant="unsuccessful" :label="t('common.deleted')" />
          </div>
          <p class="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {{ definition.nameEn }} / {{ definition.nameFr }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <CommonActionButton
            v-if="canEdit && !definition.isDraft && !definition.deleted"
            type="button"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.edit')"
            @click="openEdit(definition)" />
          <CommonActionButton
            v-if="canManageFlags && !definition.isDraft"
            type="button"
            :icon="definition.deleted ? 'i-lucide-rotate-ccw' : 'i-lucide-trash-2'"
            :color="definition.deleted ? 'neutral' : 'error'"
            variant="ghost"
            :loading="pendingActionId === definition.id"
            :disabled="pendingActionId !== null"
            :aria-label="t(definition.deleted ? 'agency.statuses.restore' : 'common.delete')"
            @click="setDeleted(definition, !definition.deleted)" />
        </div>
      </div>
    </div>
    <div class="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h3 class="font-semibold">
          {{ t('agency.statuses.reconciliation_title') }}
        </h3>
        <p class="text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('agency.statuses.reconciliation_description') }}
        </p>
      </div>
      <UAlert
        v-if="reconciliationReadStatus === 'error'"
        role="alert"
        color="error"
        variant="subtle"
        :title="t('common.configuration_load_failed')"
        :description="t('common.configuration_load_failed_description')">
        <template #actions>
          <UButton :label="t('common.retry')" color="neutral" variant="outline" @click="retryReconciliationStatuses" />
        </template>
      </UAlert>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UFormField :label="t('agency.statuses.reconciliation_start_status')" data-ui-target="agency.statuses.agency.statuses.reconciliation_start_status">
          <CommonStatusSelect v-model="reconciliationStatuses.startStatusId" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" :disabled="!canEdit" class="w-full" />
        </UFormField>
        <UFormField :label="t('agency.statuses.reconciliation_final_status')" data-ui-target="agency.statuses.agency.statuses.reconciliation_final_status">
          <CommonStatusSelect v-model="reconciliationStatuses.finalStatusId" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" :disabled="!canEdit" class="w-full" />
        </UFormField>
      </div>
      <div v-if="canEdit" class="flex justify-end">
        <CommonSaveButton :label="t('common.save')" :loading="reconciliationStatusesPending" @click="saveReconciliationStatuses" />
      </div>
    </div>

    <UModal
      v-model:open="isOpen"
      :title="selectedId ? t('agency.statuses.edit') : t('agency.statuses.add')"
      :description="t('agency.statuses.form_description')"
      :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-bind="formSession" :state="state" :validate="validate" class="space-y-6">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('agency.name_en')" name="nameEn">
              <UInput v-model="state.nameEn" class="w-full" />
            </UFormField>
            <UFormField :label="t('agency.name_fr')" name="nameFr">
              <UInput v-model="state.nameFr" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField :label="t('agency.statuses.color')" name="color">
              <UPopover>
                <UButton type="button" color="neutral" variant="outline" class="w-full justify-start" :aria-label="`${t('agency.statuses.color')}: ${state.color} (${t('common.field_required')})`">
                  <template #leading>
                    <span :style="{ backgroundColor: state.color }" class="size-3 rounded-full ring-1 ring-black/10" />
                  </template>
                  <span class="font-mono text-xs">{{ state.color }}</span>
                </UButton>
                <template #content>
                  <UColorPicker v-model="state.color" class="p-2" />
                </template>
              </UPopover>
            </UFormField>
            <UFormField :label="t('agency.statuses.icon')" name="icon">
              <CommonLucideIconPicker v-model="state.icon" />
            </UFormField>
          </div>

          <div class="flex min-h-12 items-center justify-between gap-4 border-y border-zinc-200 py-3 dark:border-zinc-800">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {{ t('agency.statuses.preview') }}
              </p>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {{ t('agency.statuses.preview_description') }}
              </p>
            </div>
            <UBadge
              color="neutral"
              variant="subtle"
              :icon="state.icon"
              :style="{ borderColor: state.color, color: state.color }">
              {{ previewLabel || t('agency.statuses.untitled') }}
            </UBadge>
          </div>

          <UFormField v-if="canManageFlags" :label="t('agency.statuses.lifecycle')" data-ui-target="agency.statuses.agency.statuses.lifecycle">
            <URadioGroup v-model="lifecycle" :items="lifecycleOptions" variant="card" />
          </UFormField>
          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('agency.statuses.contributor_lifecycle_title')"
            :description="t('agency.statuses.contributor_lifecycle_description')" />

          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :label="t('common.cancel')" :disabled="pending" @click="isOpen = false" />
            <CommonSaveButton :label="t('common.save')" :loading="pending" />
          </div>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
