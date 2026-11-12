<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { useCrudModalPending } from '~/composables/useCrudModal'
import type { FieldTooltipList, FieldTooltipItem, FieldTooltipSave } from '~~/shared/types/schemas/field-tooltip'
import { FieldTooltipSaveSchema } from '~~/shared/types/schemas/field-tooltip'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { fieldTooltipRefreshKey } from '~/utils/field-tooltip-context'

const { agencyId } = defineProps<{ agencyId: string }>()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const refreshTooltips = inject(fieldTooltipRefreshKey, undefined)
const catalog: Ref<FieldTooltipList | null> = ref(null)
const selected: Ref<FieldTooltipItem | null> = ref(null)
const { can } = useCan()
const createActionContext = useActionContext({
  identity: [() => agencyId],
  authority: () => can('help', 'create', { type: 'agency', agencyId }),
  eligible: () => Boolean(catalog.value?.capabilities.canCreate)
})
const updateActionContext = useActionContext({
  identity: [() => agencyId],
  authority: () => can('help', 'update', { type: 'agency', agencyId }),
  eligible: () => Boolean(catalog.value?.capabilities.canEdit && catalog.value.items.some(row => row.id === selected.value?.id))
})
const formActionContext = () => selected.value ? updateActionContext : createActionContext
const deleteActionContext = useActionContext({
  identity: [() => agencyId],
  authority: () => can('help', 'delete', { type: 'agency', agencyId })
})
const draft: Ref<FieldTooltipSave | null> = ref(null)
const modal = useModalSession()
const open = modal.isOpen
const loading = ref(false)
const failed = ref(false)
const modalPending = useCrudModalPending(modal.captureSession)
const saving = modalPending.isPending
const search = ref('')
const screenFilter = ref('all')
const statusFilter = ref('all')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const url = computed(() => `/api/agency/${agencyId}/tooltips`)
let generation = 0
let contextGeneration = 0
let disposed = false
const isCurrentContext = (context: number) => !disposed && context === contextGeneration
const label = (value: { en: string, fr: string }) => value[locale.value === 'fr' ? 'fr' : 'en']
const targets = computed(() => catalog.value?.targets ?? [])
const fieldNames = (item: FieldTooltipItem) => targets.value.find(target => target.key === item.egcs_ay_targetkey)?.label
  ?? { en: item.egcs_ay_label_en, fr: item.egcs_ay_label_fr }
const fieldLabel = (item: FieldTooltipItem) => label(fieldNames(item))
const screenNames = (item: FieldTooltipItem) => targets.value.find(target => target.key === item.egcs_ay_targetkey)?.viewLabel
  ?? { en: item.egcs_ay_screen_en, fr: item.egcs_ay_screen_fr }
const screenLabel = (item: FieldTooltipItem) => label(screenNames(item))
const targetOptions = computed(() => {
  const options = targets.value.map(target => ({ value: target.key, label: `${label(target.viewLabel)} > ${label(target.label)}` }))
  const retained = selected.value
  if (retained && !options.some(option => option.value === retained.egcs_ay_targetkey)) {
    options.unshift({ value: retained.egcs_ay_targetkey, label: `${screenLabel(retained)} > ${fieldLabel(retained)} (${t(`field_tooltips.status.${retained.availability}`)})` })
  }
  return options
})
const conflict = computed(() => catalog.value?.items.find(item => item.id !== selected.value?.id && item.egcs_ay_targetkey === draft.value?.egcs_ay_targetkey))
const screenKey = (item: FieldTooltipItem) => JSON.stringify([screenNames(item).en, screenNames(item).fr])
const itemStatus = (item: FieldTooltipItem) => item.availability === 'available' ? (item.egcs_ay_enabled ? 'enabled' : 'disabled') : item.availability
const screenOptions = computed(() => [
  { value: 'all', label: t('field_tooltips.all_screens') },
  ...Array.from(new Map((catalog.value?.items ?? []).map(item => [screenKey(item), { value: screenKey(item), label: screenLabel(item) }])).values())
    .sort((left, right) => left.label.localeCompare(right.label, locale.value))
])
const statusOptions = computed(() => [
  { value: 'all', label: t('common.all_statuses') },
  ...['enabled', 'disabled', 'unavailable', 'extension_disabled'].map(value => ({ value, label: t(`field_tooltips.status.${value}`) }))
])
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (catalog.value?.items ?? []).filter(item =>
    (screenFilter.value === 'all' || screenFilter.value === screenKey(item)) &&
    (statusFilter.value === 'all' || statusFilter.value === itemStatus(item)) &&
    (!query || [...Object.values(fieldNames(item)), ...Object.values(screenNames(item))].some(value => value.toLocaleLowerCase().includes(query)))
  )
})
const rows = computed(() => filtered.value.slice(pagination.value.pageIndex * pagination.value.pageSize, (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const columns = [
  { id: 'field', headerKey: 'field_tooltips.field' },
  { id: 'screen', headerKey: 'field_tooltips.screen' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

/**
 * Loads the current Agency's catalog while retaining the initiating operation's feedback owner.
 * @param ownsFeedback - Whether this reload may report an error to its initiating editor.
 */
const reload = async (ownsFeedback: () => boolean = () => true) => {
  if (disposed) return
  const request = ++generation
  const endpoint = url.value
  loading.value = true
  failed.value = false
  try {
    const response = await fetch(getClientRequestUrl(endpoint))
    if (!response.ok) await throwFetchResponseError(response)
    const result: FieldTooltipList = await response.json()
    if (!disposed && request === generation) catalog.value = result
  } catch (error) {
    if (!disposed && request === generation) {
      failed.value = true
      if (ownsFeedback()) showError(error)
    }
  } finally {
    if (!disposed && request === generation) loading.value = false
  }
}

/**
 * Opens an independent draft, preserving both languages when retargeting.
 * @param item - Existing tooltip, or null for a new entry.
 */
const edit = (item: FieldTooltipItem | null) => {
  if (disposed || saving.value) return
  open.value = false
  selected.value = item
  draft.value = item
    ? {
        egcs_ay_targetkey: item.egcs_ay_targetkey,
        egcs_ay_text_en: item.egcs_ay_text_en,
        egcs_ay_text_fr: item.egcs_ay_text_fr,
        egcs_ay_enabled: item.egcs_ay_enabled
      }
    : { egcs_ay_targetkey: '', egcs_ay_text_en: '', egcs_ay_text_fr: '', egcs_ay_enabled: false }
  open.value = true
}

/** Saves without overwriting a tooltip already attached to the destination field. */
const save = async () => {
  const operation = formActionContext().capture()
  if (!operation?.canDispatch()) return
  const session = modal.captureSession()
  const context = contextGeneration
  const item = selected.value
  const form = draft.value
  if (!form || session === null || disposed || conflict.value
    || (item ? !catalog.value?.capabilities.canEdit : !catalog.value?.capabilities.canCreate)
    || !modalPending.begin(session)) return
  const endpoint = `${url.value}${item ? `/${item.id}` : ''}`
  const body = { ...form }
  const ownsEditor = () => operation.isCurrent() && isCurrentContext(context) && modal.isCurrentSession(session)
  let closed = false
  const ownsFeedback = () => operation.isCurrent() && isCurrentContext(context) && draft.value === form
    && (modal.isCurrentSession(session) || (closed && modal.captureSession() === null))
  try {
    const response = await fetch(getClientRequestUrl(endpoint), {
      method: item ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent() || !isCurrentContext(context)) return
    if (ownsEditor()) {
      open.value = false
      closed = true
    }
    await Promise.all([reload(ownsFeedback), refreshTooltips?.()])
  } catch (error) {
    if (ownsFeedback()) showError(error)
  } finally { modalPending.end(session) }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: formActionContext }, submit: save })

/**
 * Confirms deletion against the original agency and rejects a changed context.
 * @param item - Saved tooltip to delete.
 */
const remove = async (item: FieldTooltipItem) => {
  const context = contextGeneration
  const operation = deleteActionContext.capture()
  const id = item.id
  const isCurrent = () => isCurrentContext(context) && Boolean(operation?.isCurrent())
  const canProceed = () => isCurrentContext(context) && Boolean(catalog.value?.capabilities.canDelete)
  if (!canProceed()) return
  try {
    if (await confirmDeleteRequest(`${url.value}/${id}`, {
      operation,
      target: { id, resolve: () => catalog.value?.items.find(row => row.id === id), eligible: () => Boolean(catalog.value?.capabilities.canDelete) },
      shouldProceed: canProceed
    }) && isCurrent()) {
      await Promise.all([reload(), refreshTooltips?.()])
    }
  } catch (error) {
    if (isCurrent()) showError(error)
  }
}

watch([search, screenFilter, statusFilter], () => {
  pagination.value.pageIndex = 0
})
watch(() => [filtered.value.length, pagination.value.pageSize], () => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex, Math.max(0, Math.ceil(filtered.value.length / pagination.value.pageSize) - 1))
})
watch(url, () => {
  contextGeneration += 1
  catalog.value = null
  selected.value = null
  draft.value = null
  open.value = false
  search.value = ''
  screenFilter.value = 'all'
  statusFilter.value = 'all'
  pagination.value.pageIndex = 0
  void reload()
}, { immediate: true, flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  contextGeneration += 1
  generation += 1
})
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
    <p class="text-muted">
      {{ t('field_tooltips.description') }}
    </p>
    <UAlert v-if="failed" color="error" :title="t('common.load_failed')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="reload()" />
      </template>
    </UAlert>
    <CommonResourceLayout
      v-model:search="search" v-model:pagination="pagination" layout="page" :data="rows" :columns="columns"
      :total-records="filtered.length" :loading="loading" :show-button="Boolean(catalog?.capabilities.canCreate)"
      :button-label="t('field_tooltips.add')" :request-status="loading ? 'pending' : failed ? 'error' : 'success'"
      @add="edit(null)" @retry="reload()">
      <template #filters>
        <USelect
          v-model="screenFilter" :items="screenOptions" :required="false" :aria-required="false" :aria-label="t('field_tooltips.screen')"
          data-field-exclude="Help administration screen quick filter" class="w-full sm:w-48" />
        <USelect
          v-model="statusFilter" :items="statusOptions" :required="false" :aria-required="false" :aria-label="t('common.status')"
          data-field-exclude="Help administration status quick filter" class="w-full sm:w-48" />
      </template>
      <template #field-cell="{ row }">
        {{ fieldLabel(row.original) }}
      </template>
      <template #screen-cell="{ row }">
        {{ screenLabel(row.original) }}
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.availability === 'available' ? 'neutral' : 'warning'" variant="subtle"
          :label="t(`field_tooltips.status.${itemStatus(row.original)}`)" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            icon="i-lucide-pencil" color="neutral" variant="ghost"
            :aria-label="`${t(catalog?.capabilities.canEdit ? 'common.edit' : 'field_tooltips.inspect')}: ${fieldLabel(row.original)}`" @click="edit(row.original)" />
          <CommonActionButton
            v-if="catalog?.capabilities.canDelete" icon="i-lucide-trash" color="error" variant="ghost"
            :aria-label="`${t('common.delete')}: ${fieldLabel(row.original)}`" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <UModal v-model:open="open" :dismissible="!saving" :close="saving ? false : undefined" :title="t(selected ? 'field_tooltips.edit' : 'field_tooltips.add')" :description="t('common.form_dialog_description')" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <UForm v-if="draft" v-bind="formSession" data-field-scope="agency.field-help" data-scope-label-en="Agency — Field help" data-scope-label-fr="Organisme — Aide aux champs" :state="draft" :validate="createValidator(FieldTooltipSaveSchema)" class="space-y-4">
          <UAlert
            v-if="selected && selected.availability !== 'available'" color="warning"
            :title="t(`field_tooltips.status.${selected.availability}`)" :description="t(`field_tooltips.${selected.availability}_help`)" />
          <p v-if="selected" class="text-sm text-muted">
            {{ `${screenLabel(selected)} > ${fieldLabel(selected)}` }}
          </p>
          <UFormField data-field-label-en="Target field" data-field-label-fr="Champ cible" :label="t(selected ? 'field_tooltips.retarget' : 'field_tooltips.field')" name="egcs_ay_targetkey" required :ui="{ error: 'min-h-5' }">
            <USelectMenu v-model="draft.egcs_ay_targetkey" :items="targetOptions" value-key="value" virtualize :disabled="saving || (!catalog?.capabilities.canEdit && Boolean(selected))" class="w-full" :placeholder="t('field_tooltips.choose_field')" />
            <template #error="{ error }">
              {{ error }}
            </template>
          </UFormField>
          <UAlert v-if="conflict" color="warning" :title="t('field_tooltips.api.conflict')" />
          <UFormField :label="t('field_tooltips.text_en')" name="egcs_ay_text_en" :required="draft.egcs_ay_enabled" :ui="{ error: 'min-h-5' }">
            <UTextarea v-model="draft.egcs_ay_text_en" lang="en" :maxlength="4000" :disabled="saving || (!catalog?.capabilities.canEdit && Boolean(selected))" class="w-full" />
            <template #error="{ error }">
              {{ error }}
            </template>
          </UFormField>
          <UFormField :label="t('field_tooltips.text_fr')" name="egcs_ay_text_fr" :required="draft.egcs_ay_enabled" :ui="{ error: 'min-h-5' }">
            <UTextarea v-model="draft.egcs_ay_text_fr" lang="fr" :maxlength="4000" :disabled="saving || (!catalog?.capabilities.canEdit && Boolean(selected))" class="w-full" />
            <template #error="{ error }">
              {{ error }}
            </template>
          </UFormField>
          <UCheckbox v-model="draft.egcs_ay_enabled" name="egcs_ay_enabled" :label="t('field_tooltips.enabled')" :description="t('field_tooltips.enabled_help')" :disabled="saving || (!catalog?.capabilities.canEdit && Boolean(selected))" />
          <CommonSaveButton v-if="selected ? catalog?.capabilities.canEdit : catalog?.capabilities.canCreate" :label="t('common.save')" :loading="saving" :disabled="Boolean(conflict)" />
        </UForm>
      </template>
    </UModal>
  </div>
</template>
