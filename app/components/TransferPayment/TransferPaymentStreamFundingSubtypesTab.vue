<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { TableColumnInput } from '~/composables/useTableColumns'
import { StreamFundingSubtypeSchema } from '~~/shared/types/schemas/funding-sources'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

type LinkedSubtype = {
  id: string
  egcs_tp_fundingsubtype: string
  egcs_ay_name_en: string
  egcs_ay_name_fr: string
  egcs_ay_type_name_en: string
  egcs_ay_type_name_fr: string
  egcs_ay_instacking: boolean
  egcs_ay_incostsharing: boolean
}
const { transferPaymentId, streamId, agencyId, canCreateChild, canDeleteChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string | null
  canCreateChild: boolean
  canDeleteChild: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const toast = useToast()
const baseUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/funding-subtypes`)
const lookupUrl = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/funding-subtypes`)
const { data: links, refresh: refreshLinks, status: linkStatus } = await useFetch<{ items: LinkedSubtype[] }, FetchError, string>(baseUrl)
const selected: Ref<{ egcs_tp_fundingsubtype?: string } | null> = ref(null)
const saving: Ref<boolean> = ref(false)
const removing: Ref<boolean> = ref(false)
const validate = createValidator(StreamFundingSubtypeSchema)
const items = computed(() => links.value?.items ?? [])
const search: Ref<string> = ref('')
const pagination: Ref<{ pageIndex: number; pageSize: number }> = ref({ pageIndex: 0, pageSize: 10 })
const filteredItems = computed(() => items.value.filter(item => {
  const value = search.value.trim().toLocaleLowerCase()
  return !value || [item.egcs_ay_name_en, item.egcs_ay_name_fr, item.egcs_ay_type_name_en, item.egcs_ay_type_name_fr]
    .some(name => name.toLocaleLowerCase().includes(value))
}))
const pageItems = computed(() => filteredItems.value.slice(pagination.value.pageIndex * pagination.value.pageSize,
  (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const columns: TableColumnInput<LinkedSubtype>[] = [
  { id: 'name', headerKey: 'agency.funding_types.subtypes' },
  { id: 'type', headerKey: 'agency.funding_types.type' },
  { id: 'stacking', headerKey: 'agency.funding_types.stacking' },
  { id: 'costSharing', headerKey: 'agency.funding_types.cost_sharing' },
  { id: 'actions', headerKey: 'common.actions' }
]
watch([() => transferPaymentId, () => streamId, () => agencyId], () => {
  selected.value = null
}, { flush: 'sync' })
watch(search, () => {
  pagination.value.pageIndex = 0
})

/** Adds an Agency subtype to the Stream after validation. */
const save = async () => {
  if (!selected.value?.egcs_tp_fundingsubtype || saving.value || !canCreateChild) return
  saving.value = true
  try {
    const response = await fetch(getClientRequestUrl(baseUrl.value), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selected.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    selected.value = null
    await refreshLinks()
    toast.add({ title: t('common.success'), description: t('common.added_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    saving.value = false
  }
}

/**
 * Removes a Stream subtype association without deleting historical funding evidence.
 * @param row - Active association selected from the Stream table.
 */
const remove = async (row: LinkedSubtype) => {
  if (!canDeleteChild || removing.value) return
  removing.value = true
  try {
    if (await confirmDeleteRequest(`${baseUrl.value}/${row.id}`)) {
      await refreshLinks()
      toast.add({ title: t('common.success'), description: t('common.deleted_success'), color: 'success' })
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="pageItems"
      :columns="columns"
      :total-records="filteredItems.length"
      :loading="linkStatus === 'pending'"
      :request-status="linkStatus"
      :show-button="canCreateChild"
      :button-label="t('agency.funding_types.add_subtype')"
      @add="selected = {}"
      @retry="refreshLinks">
      <template #name-cell="{ row }">
        <CommonBilingualName :name-en="row.original.egcs_ay_name_en" :name-fr="row.original.egcs_ay_name_fr" />
      </template>
      <template #type-cell="{ row }">
        {{ getBilingualValue(row.original, 'egcs_ay_type_name', '') }}
      </template>
      <template #stacking-cell="{ row }">
        {{ row.original.egcs_ay_instacking ? t('common.yes') : t('common.no') }}
      </template>
      <template #costSharing-cell="{ row }">
        {{ row.original.egcs_ay_incostsharing ? t('common.yes') : t('common.no') }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            v-if="canDeleteChild" icon="i-lucide-trash" color="error" variant="ghost"
            :aria-label="t('common.delete_named', { name: getBilingualValue(row.original, 'egcs_ay_name', row.original.id) })"
            :disabled="removing" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <UModal
      v-if="selected && canCreateChild" :open="Boolean(selected)" :title="t('agency.funding_types.add_subtype')"
      @update:open="value => { if (!value) selected = null }">
      <template #body>
        <UForm :state="selected" :validate="validate" class="space-y-4" @submit="save">
          <UFormField :label="t('agency.funding_types.subtypes')" name="egcs_tp_fundingsubtype" required>
            <CommonServerLookupSelect
              v-model="selected.egcs_tp_fundingsubtype" :fetch-url="lookupUrl"
              value-key="id" label-en-key="egcs_ay_name_en" label-fr-key="egcs_ay_name_fr"
              :include-deleted-query="false" />
          </UFormField>
          <div class="flex justify-end gap-2 pt-4">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="selected = null" />
            <CommonSaveButton :label="t('common.add')" :loading="saving" :disabled="saving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
