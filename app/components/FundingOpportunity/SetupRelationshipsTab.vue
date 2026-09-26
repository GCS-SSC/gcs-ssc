<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
const { getBilingualValue } = useBilingualValue()

const linkedRows = ref<SetupRow[]>([])
const linkedIds = computed(() => new Set(linkedRows.value.map(row => row.id)))
const pendingId = ref<string | null>(null)
const contextKey = computed(() => `${props.opportunityId}:${props.kind}`)
let mutationGeneration = 0
let disposed = false

watch(() => props.linkedSetups, value => {
  linkedRows.value = value.map(row => ({ id: row.id, label_en: row.name_en, label_fr: row.name_fr }))
}, { immediate: true })
watch(contextKey, () => {
  mutationGeneration += 1
  pendingId.value = null
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  mutationGeneration += 1
})

const lookupQuery = computed(() => ({
  stream_ids: props.streamIds.join(','),
  kind: props.kind
}))
const {
  search,
  pagination,
  items,
  totalRecords,
  status,
  retry
} = useResourceTable<SetupRow>({
  fetchUrl: '/api/funding-opportunities/lookups/setups',
  query: lookupQuery,
  enabled: computed(() => props.streamIds.length > 0),
  contextKey
})

const columns: TableColumnInput<SetupRow>[] = [
  { id: 'name', accessorKey: 'label_en', headerKey: 'common.name' },
  { id: 'actions', headerKey: 'common.actions' }
]
const bilingualColumns = [{
  id: 'name', accessorKey: { en: 'label_en', fr: 'label_fr' }
}] as const
const linkedColumns = useTableColumns(columns, [...bilingualColumns])
const setupName = (row: SetupRow) => getBilingualValue(row, 'label', row.id)

/**
 * Replaces only this relationship set using the Opportunity's authorized PATCH route.
 * @param row - The selected published or associated setup.
 * @param action - Whether to add or remove its link.
 */
const saveLinks = async (row: SetupRow, action: 'associate' | 'disassociate') => {
  if (!props.canEdit || pendingId.value !== null) return
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
    emit('refresh')
  } catch (error: unknown) {
    if (!disposed && generation === mutationGeneration) showError(error)
  } finally {
    if (!disposed && generation === mutationGeneration) pendingId.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <section class="space-y-3" :aria-label="t('funding_opportunity.associated_setups')">
      <h2 class="text-lg font-semibold">
        {{ t('funding_opportunity.associated_setups') }}
      </h2>
      <div v-if="linkedRows.length" class="overflow-x-auto rounded-lg border border-default">
        <UTable :data="linkedRows" :columns="linkedColumns" class="min-w-full">
          <template #name-cell="{ row }">
            <span class="font-bold text-zinc-900 dark:text-white">
              <CommonBilingualName :name-en="row.original.label_en" :name-fr="row.original.label_fr" />
            </span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="canEdit"
                icon="i-lucide-unlink"
                color="error"
                variant="ghost"
                size="sm"
                :label="t('funding_opportunity.disassociate')"
                :aria-label="`${t('funding_opportunity.disassociate')}: ${setupName(row.original)}`"
                :loading="pendingId === row.original.id"
                :disabled="pendingId !== null"
                @click="saveLinks(row.original, 'disassociate')" />
            </div>
          </template>
        </UTable>
      </div>
      <p v-else class="rounded-lg border border-default px-4 py-8 text-center text-sm text-muted">
        {{ t('funding_opportunity.no_associated_setups') }}
      </p>
    </section>

    <section class="space-y-3" :aria-label="t('funding_opportunity.available_setups')">
      <h2 class="text-lg font-semibold">
        {{ t('funding_opportunity.available_setups') }}
      </h2>
      <CommonResourceLayoutCard
        v-model:search="search"
        v-model:pagination="pagination"
        :data="items"
        :columns="columns"
        :bilingual-columns="[...bilingualColumns]"
        :total-records="totalRecords"
        :request-status="status"
        :loading="status === 'pending'"
        :show-button="false"
        :show-column-toggle="false"
        @retry="retry">
        <template #name-cell="{ row }">
          <span class="font-bold text-zinc-900 dark:text-white">
            <CommonBilingualName :name-en="row.original.label_en" :name-fr="row.original.label_fr" />
          </span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              v-if="canEdit && !linkedIds.has(row.original.id)"
              icon="i-lucide-link"
              color="primary"
              variant="ghost"
              size="sm"
              :label="t('funding_opportunity.associate')"
              :aria-label="`${t('funding_opportunity.associate')}: ${setupName(row.original)}`"
              :loading="pendingId === row.original.id"
              :disabled="pendingId !== null || status !== 'success'"
              @click="saveLinks(row.original, 'associate')" />
          </div>
        </template>
      </CommonResourceLayoutCard>
    </section>
  </div>
</template>
