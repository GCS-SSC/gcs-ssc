<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import { useTableListState } from '~/composables/useTableListState'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type SetupKind = 'review' | 'workflow'
type LinkedSetup = { id: string; name_en: string; name_fr: string }
type SetupRow = { id: string; label_en: string; label_fr: string }

const props = defineProps<{
  opportunityId: string
  streamIds: string[]
  linkedSetups: LinkedSetup[]
  kind: SetupKind
  canEdit: boolean
}>()
const emit = defineEmits<{ refresh: [] }>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { createValidator } = useZodI18n()
const LinkSchema = z.object({
  id: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
})
const draft: Ref<{ id?: string } | null> = ref(null)
const selectedSetup: Ref<SetupRow | null> = ref(null)
const { getBilingualValue } = useBilingualValue()

const linkedRows: Ref<SetupRow[]> = ref([])
const { search: linkedSearch, pagination: linkedPagination } = useTableListState(10)
const filteredLinkedRows = computed(() => {
  const query = linkedSearch.value.trim().toLocaleLowerCase()
  return linkedRows.value.filter(row => `${row.label_en} ${row.label_fr}`.toLocaleLowerCase().includes(query))
})
const linkedPage = computed(() => {
  const start = linkedPagination.value.pageIndex * linkedPagination.value.pageSize
  return filteredLinkedRows.value.slice(start, start + linkedPagination.value.pageSize)
})
watch(linkedSearch, () => {
  linkedPagination.value.pageIndex = 0
})
watch([() => filteredLinkedRows.value.length, () => linkedPagination.value.pageSize], () => {
  const lastPage = Math.max(0, Math.ceil(filteredLinkedRows.value.length / linkedPagination.value.pageSize) - 1)
  linkedPagination.value.pageIndex = Math.min(linkedPagination.value.pageIndex, lastPage)
})
const linkedIds = computed(() => new Set(linkedRows.value.map(row => row.id)))
const pendingId: Ref<string | null> = ref(null)
const contextKey = computed(() => `${props.opportunityId}:${props.kind}`)
let mutationGeneration = 0
let disposed = false

watch(() => props.linkedSetups, value => {
  linkedRows.value = value.map(row => ({ id: row.id, label_en: row.name_en, label_fr: row.name_fr }))
}, { immediate: true })
watch(contextKey, () => {
  mutationGeneration += 1
  pendingId.value = null
  draft.value = null
  selectedSetup.value = null
  linkedSearch.value = ''
  linkedPagination.value.pageIndex = 0
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  mutationGeneration += 1
})

const lookupQuery = computed(() => ({
  stream_ids: props.streamIds.join(','),
  kind: props.kind
}))
const columns: TableColumnInput<SetupRow>[] = [
  { id: 'name', accessorKey: 'label_en', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns = [{
  id: 'name', accessorKey: { en: 'label_en', fr: 'label_fr' }
}] as const
watch(() => props.canEdit, canEdit => {
  if (!canEdit) {
    draft.value = null
    selectedSetup.value = null
  }
})
watch(() => props.streamIds.join(','), () => {
  draft.value = null
  selectedSetup.value = null
})
/** Opens a fresh single-setup association form. */
const openAssociation = () => {
  if (!props.canEdit || pendingId.value !== null || props.streamIds.length === 0) return
  draft.value = {}
  selectedSetup.value = null
}
/** Closes the form after any in-flight mutation has finished. */
const closeAssociation = () => {
  if (pendingId.value !== null) return
  draft.value = null
  selectedSetup.value = null
}
/** Keeps the selected setup's bilingual labels for immediate table feedback.
 * @param items - Resolved selected lookup records.
 */
const onResolvedSetup = (items: AdminCommonLookupResponseItem[]) => {
  const item = items.find(candidate => candidate.id === draft.value?.id)
  selectedSetup.value = item && typeof item.label_en === 'string' && typeof item.label_fr === 'string'
    ? { id: item.id, label_en: item.label_en, label_fr: item.label_fr }
    : null
}
/** Associates the explicitly selected setup after form validation. */
const associate = async () => {
  const id = draft.value?.id
  if (!id) return
  const selected = selectedSetup.value
  await saveLinks(selected?.id === id ? selected : { id, label_en: id, label_fr: id }, 'associate')
}
const setupName = (row: SetupRow) => getBilingualValue(row, 'label', row.id)

/**
 * Replaces only this relationship set using the Opportunity's authorized PATCH route.
 * @param row - The selected published or associated setup.
 * @param action - Whether to add or remove its link.
 */
const saveLinks = async (row: SetupRow, action: 'associate' | 'disassociate') => {
  if (!props.canEdit || pendingId.value !== null || disposed) return
  const currentIds = linkedIds.value
  if ((action === 'associate') === currentIds.has(row.id)) return
  const requestedRows = action === 'associate'
    ? [...linkedRows.value, row]
    : linkedRows.value.filter(link => link.id !== row.id)
  const opportunityId = props.opportunityId
  const kind = props.kind
  const generation = mutationGeneration
  pendingId.value = row.id
  try {
    const response = await fetch(getClientRequestUrl(`/api/funding-opportunities/${opportunityId}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        [kind === 'review' ? 'egcs_fo_reviewsetups' : 'egcs_fo_workflowsetups']: requestedRows.map(link => link.id)
      })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (disposed || generation !== mutationGeneration || opportunityId !== props.opportunityId || kind !== props.kind) return
    linkedRows.value = requestedRows
    if (action === 'associate') {
      draft.value = null
      selectedSetup.value = null
    }
    emit('refresh')
  } catch (error: unknown) {
    if (!disposed && generation === mutationGeneration) showError(error)
  } finally {
    if (!disposed && generation === mutationGeneration) pendingId.value = null
  }
}
</script>

<template>
  <CommonResourceLayoutCard
    v-model:search="linkedSearch"
    v-model:pagination="linkedPagination"
    :data="linkedPage"
    :columns="columns"
    :bilingual-columns="[...bilingualColumns]"
    :total-records="filteredLinkedRows.length"
    :show-button="canEdit"
    :button-label="t('common.add')"
    @add="openAssociation">
    <template #name-cell="{ row }">
      <CommonBilingualName :name-en="row.original.label_en" :name-fr="row.original.label_fr" />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-2">
        <UButton
          v-if="canEdit"
          icon="i-lucide-unlink"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="`${t('funding_opportunity.disassociate')}: ${setupName(row.original)}`"
          :loading="pendingId === row.original.id"
          :disabled="pendingId !== null"
          @click="saveLinks(row.original, 'disassociate')" />
      </div>
    </template>
  </CommonResourceLayoutCard>

  <UModal
    v-if="canEdit"
    :open="draft !== null"
    :title="t(kind === 'review' ? 'funding_opportunity.review_setups' : 'funding_opportunity.workflow_setups')"
    :description="t('funding_opportunity.available_setups')"
    @update:open="value => { if (!value) closeAssociation() }">
    <template #body>
      <UForm v-if="draft" :state="draft" :validate="createValidator(LinkSchema)" class="space-y-4" @submit="associate">
        <UFormField :label="t(kind === 'review' ? 'funding_opportunity.review_setups' : 'funding_opportunity.workflow_setups')" name="id" required>
          <CommonServerLookupSelect
            v-model="draft.id"
            fetch-url="/api/funding-opportunities/lookups/setups"
            :query="lookupQuery"
            selected-values-query-key="ids"
            value-key="id"
            label-en-key="label_en"
            label-fr-key="label_fr"
            :exclude-values="[...linkedIds]"
            :disabled="pendingId !== null"
            aria-required="true"
            close-on-select
            searchable
            @resolved-items="onResolvedSetup" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" :disabled="pendingId !== null" @click="closeAssociation" />
          <CommonSaveButton :label="t('common.add')" :loading="pendingId !== null" :disabled="pendingId !== null" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
