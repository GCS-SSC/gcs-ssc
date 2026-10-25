<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { z } from 'zod'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'

const { transferPaymentId, streamId, agencyId, canUpdateChild, showHeader = true } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  showHeader?: boolean
}>()

type ReviewSetLink = {
  id: string
  egcs_tp_reviewset: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_directreview: boolean
  publicationState: 'draft' | 'published' | 'retired'
}
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const LinkSchema = z.object({
  egcs_tp_reviewset: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
}).strict()
const state: Ref<{ egcs_tp_reviewset: string } | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
const endpoint = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-sets`)
const { data, refresh, status } = await useFetch<{ items: ReviewSetLink[] }, FetchError, string>(endpoint)
const items = computed(() => data.value?.items ?? [])
const search = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const filteredItems = computed(() => items.value.filter(item => {
  const value = search.value.trim().toLocaleLowerCase()
  return !value || [item.egcs_cn_name_en, item.egcs_cn_name_fr]
    .some(label => label.toLocaleLowerCase().includes(value))
}))
const pageItems = computed(() => filteredItems.value.slice(pagination.value.pageIndex * pagination.value.pageSize,
  (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const columns: TableColumnInput<ReviewSetLink>[] = [
  { id: 'name', accessorKey: 'egcs_cn_name_en', headerKey: 'common.name' },
  { id: 'publicationState', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]
watch(search, () => {
  pagination.value.pageIndex = 0
})
watch(() => items.value.length, () => {
  pagination.value.pageIndex = Math.min(pagination.value.pageIndex,
    Math.max(0, Math.ceil(filteredItems.value.length / pagination.value.pageSize) - 1))
})
watch(endpoint, () => {
  state.value = null
  search.value = ''
  pagination.value.pageIndex = 0
})
const openLink = () => {
  state.value = { egcs_tp_reviewset: '' }
}
const closeLink = () => {
  state.value = null
}
/** Saves a selected Agency Review Set link on this Stream. */
const saveLink = async () => {
  if (!state.value || isSaving.value) return
  try {
    isSaving.value = true
    const response = await fetch(getClientRequestUrl(endpoint.value), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state.value)
    })
    if (!response.ok) await throwFetchResponseError(response)
    closeLink()
    await refresh()
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}
/**
 * Removes a Stream Review Set link.
 * @param link - The selected link.
 */
const removeLink = async (link: ReviewSetLink) => {
  try {
    if (await confirmDeleteRequest(`${endpoint.value}/${link.id}`)) await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <section class="space-y-4" data-field-scope="transfer-payment.review-setups-tab">
    <h2 v-if="showHeader" class="text-lg font-semibold">
      {{ t('transfer_payment.review_setups') }}
    </h2>
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="pageItems"
      :columns="columns"
      :bilingual-columns="[{ id: 'name', accessorKey: { en: 'egcs_cn_name_en', fr: 'egcs_cn_name_fr' } }]"
      :total-records="filteredItems.length"
      :loading="status === 'pending'"
      :request-status="status"
      :button-label="t('common.add')"
      :show-button="canUpdateChild && !!agencyId"
      @add="openLink"
      @retry="refresh">
      <template #name-cell="{ row }">
        <NuxtLink v-if="agencyId" :to="localePath(appRouteLocations.agencyReviewSetDetail(agencyId, row.original.egcs_tp_reviewset))" class="font-bold text-zinc-900 hover:text-primary dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_cn_name_en" :name-fr="row.original.egcs_cn_name_fr" />
        </NuxtLink>
        <CommonBilingualName v-else :name-en="row.original.egcs_cn_name_en" :name-fr="row.original.egcs_cn_name_fr" />
      </template>
      <template #publicationState-cell="{ row }">
        <CommonLifecycleBadge engine="publication" :state="row.original.publicationState" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            v-if="canUpdateChild" icon="i-lucide-trash" color="error" variant="ghost" size="sm"
            :aria-label="t('common.delete_named', { name: locale === 'fr' ? row.original.egcs_cn_name_fr : row.original.egcs_cn_name_en })"
            @click="removeLink(row.original)" />
        </div>
      </template>
    </CommonResourceLayoutCard>
    <UModal :open="state !== null" :title="t('transfer_payment.review_setups')" @update:open="value => { if (!value) closeLink() }">
      <template #body>
        <UForm v-if="state && agencyId" :state="state" :validate="createValidator(LinkSchema)" class="space-y-4" @submit="saveLink">
          <UFormField :label="t('transfer_payment.review_set')" name="egcs_tp_reviewset" required>
            <CommonServerLookupSelect
              v-model="state.egcs_tp_reviewset"
              :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/review-sets`"
              value-key="id"
              :include-deleted-query="false" selected-values-query-key="ids" label-en-key="egcs_cn_name_en"
              label-fr-key="egcs_cn_name_fr"
              :query="{}"
              aria-required="true" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="closeLink" />
            <CommonSaveButton :label="t('common.save')" :loading="isSaving" :disabled="isSaving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
