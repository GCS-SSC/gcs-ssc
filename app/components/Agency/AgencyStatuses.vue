<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Local UI event handlers are described by their names and focused tests. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { StatusDefinitionCreateSchema, type StatusDefinitionInput } from '~~/shared/types/schemas'
import type { StatusDefinition } from '~~/shared/types/status'
import type { AgencyClaimReconciliationStatusConfiguration } from '~~/shared/types/schemas/agency'
import { useStatusCatalog } from '~/composables/useStatusCatalog'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'

type StatusLifecycle = 'normal' | 'readOnly' | 'terminal'

const { agencyId, canCreate, canUpdate, canDelete } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()
const { locale, t } = useI18n()
const { showError } = useApiErrorToast()
const toast = useToast()
const confirmDelete = useDeleteConfirm()
const catalog = useStatusCatalog()
const canEdit = computed(() => canUpdate)
const canManageFlags = computed(() => canDelete)
const definitions = computed(() => catalog.getForAgency(agencyId, true))
const isOpen: Ref<boolean> = ref(false)
const selectedId: Ref<string | null> = ref(null)
const modalSession: Ref<number> = ref(0)
const pendingSession: Ref<number | null> = ref(null)
const pending = computed(() => pendingSession.value === modalSession.value)
const pendingActionId: Ref<string | null> = ref(null)
const reconciliationStatuses: Ref<AgencyClaimReconciliationStatusConfiguration> = ref({ startStatusId: null, finalStatusId: null })
const reconciliationStatusesPending: Ref<boolean> = ref(false)
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

const refreshReconciliationStatuses = async (requestedAgencyId: string, generation: number) => {
  const response = await fetch(getClientRequestUrl(`/api/agency/${requestedAgencyId}/claim-reconciliation-statuses`))
  if (!response.ok) await throwFetchResponseError(response)
  const nextStatuses = await response.json() as AgencyClaimReconciliationStatusConfiguration
  if (generation !== agencyRefreshGeneration || requestedAgencyId !== agencyId) return
  reconciliationStatuses.value = nextStatuses
}

watch(() => agencyId, requestedAgencyId => {
  const generation = ++agencyRefreshGeneration
  reconciliationStatuses.value = { startStatusId: null, finalStatusId: null }
  reconciliationStatusesPending.value = false
  pendingActionId.value = null
  isOpen.value = false
  selectedId.value = null

  void catalog.refreshAgency(requestedAgencyId).catch(error => {
    if (generation === agencyRefreshGeneration && requestedAgencyId === agencyId) showError(error)
  })
  void refreshReconciliationStatuses(requestedAgencyId, generation).catch(error => {
    if (generation === agencyRefreshGeneration && requestedAgencyId === agencyId) showError(error)
  })
}, { immediate: true })

const saveReconciliationStatuses = async () => {
  if (reconciliationStatusesPending.value) return
  try {
    reconciliationStatusesPending.value = true
    const response = await fetch(getClientRequestUrl(`/api/agency/${agencyId}/claim-reconciliation-statuses`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reconciliationStatuses.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    reconciliationStatuses.value = await response.json() as AgencyClaimReconciliationStatusConfiguration
    toast.add({ title: t('common.success'), description: t('agency.statuses.reconciliation_saved'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    reconciliationStatusesPending.value = false
  }
}

const getLifecycle = (definition: StatusDefinition): StatusLifecycle => definition.terminal
  ? 'terminal'
  : definition.readOnly ? 'readOnly' : 'normal'

const openCreate = () => {
  modalSession.value += 1
  selectedId.value = null
  state.value = { nameEn: '', nameFr: '', color: '#64748b', icon: 'i-lucide-circle', readOnly: false, terminal: false }
  lifecycle.value = 'normal'
  terminalLocked.value = false
  isOpen.value = true
}
const openEdit = (definition: StatusDefinition) => {
  if (definition.isDraft) return
  modalSession.value += 1
  selectedId.value = definition.id
  state.value = { nameEn: definition.nameEn, nameFr: definition.nameFr, color: definition.color, icon: definition.icon, readOnly: definition.readOnly, terminal: definition.terminal }
  lifecycle.value = getLifecycle(definition)
  terminalLocked.value = definition.terminal
  isOpen.value = true
}
const save = async () => {
  const requestSession = modalSession.value
  const updating = selectedId.value !== null
  const statusId = selectedId.value
  pendingSession.value = requestSession
  try {
    const url = updating ? `/api/agency/statuses/${statusId}` : `/api/agency/${agencyId}/statuses`
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
    const response = await fetch(url, { method: updating ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) await throwFetchResponseError(response)
    if (modalSession.value === requestSession) isOpen.value = false
    toast.add({ title: t('common.success'), description: t(updating ? 'common.updated_success' : 'common.created_success'), color: 'success' })
    try {
      await catalog.refreshAgency(agencyId)
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    if (pendingSession.value === requestSession) pendingSession.value = null
  }
}
watch(isOpen, open => {
  if (!open) modalSession.value += 1
})
const setDeleted = async (definition: StatusDefinition, deleted: boolean) => {
  const localizedName = locale.value === 'fr'
    ? definition.nameFr
    : definition.nameEn
  if (deleted && !await confirmDelete({ description: t('agency.statuses.delete_confirmation', { name: localizedName }) })) return
  pendingActionId.value = definition.id
  try {
    const response = await fetch(`/api/agency/statuses/${definition.id}/${deleted ? 'delete' : 'restore'}`, { method: 'POST' })
    if (!response.ok) await throwFetchResponseError(response)
    toast.add({ title: t('common.success'), description: t(deleted ? 'agency.statuses.deleted_success' : 'agency.statuses.restored_success'), color: 'success' })
    try {
      await catalog.refreshAgency(agencyId)
    } catch (refreshError) {
      showError(refreshError)
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    pendingActionId.value = null
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-semibold">
          {{ t('agency.statuses.title') }}
        </h2>
        <p class="text-sm text-zinc-500">
          {{ t('agency.statuses.description') }}
        </p>
      </div>
      <UButton v-if="canCreate" icon="i-lucide-plus" :label="t('agency.statuses.add')" @click="openCreate" />
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
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UFormField :label="t('agency.statuses.reconciliation_start_status')">
          <CommonStatusSelect v-model="reconciliationStatuses.startStatusId" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" :disabled="!canEdit" class="w-full" />
        </UFormField>
        <UFormField :label="t('agency.statuses.reconciliation_final_status')">
          <CommonStatusSelect v-model="reconciliationStatuses.finalStatusId" :agency-id="agencyId" allow-empty :empty-label="t('workflow.no_change')" :disabled="!canEdit" class="w-full" />
        </UFormField>
      </div>
      <div v-if="canEdit" class="flex justify-end">
        <CommonSaveButton :label="t('common.save')" :loading="reconciliationStatusesPending" @click="saveReconciliationStatuses" />
      </div>
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
          <UButton
            v-if="canEdit && !definition.isDraft && !definition.deleted"
            type="button"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            :aria-label="t('common.edit')"
            @click="openEdit(definition)" />
          <UButton
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

    <UModal
      v-model:open="isOpen"
      :title="selectedId ? t('agency.statuses.edit') : t('agency.statuses.add')"
      :description="t('agency.statuses.form_description')"
      :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm :state="state" :validate="validate" class="space-y-6" @submit="save">
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
                <UButton type="button" color="neutral" variant="outline" class="w-full justify-start">
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

          <UFormField v-if="canManageFlags" :label="t('agency.statuses.lifecycle')">
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
