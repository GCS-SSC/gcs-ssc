<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { z } from 'zod'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'

type LinkedWorkflow = {
  id: string
  egcs_tp_workflow: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_purpose: string
  publicationState: PublicationState
}
const { transferPaymentId, streamId, agencyId, canUpdateChild, entityType } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
  entityType?: string
}>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const selectedWorkflowId: Ref<string | undefined> = ref(undefined)
const isLinkOpen = ref(false)
const isSaving = ref(false)
const isDeleting = ref(false)
const { createValidator } = useZodI18n()
const LinkSchema = z.object({
  egcs_tp_workflow: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
}).strict()
const linkState = computed(() => ({ egcs_tp_workflow: selectedWorkflowId.value }))
const endpoint = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflows`)
const { data, refresh, status } = await useFetch<{ items: LinkedWorkflow[] }, FetchError, string>(endpoint)
const items = computed(() => (data.value?.items ?? [])
  .filter(item => !entityType || item.egcs_cn_entitytype === entityType))
const search = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const filteredItems = computed(() => items.value.filter(item => {
  const value = search.value.trim().toLocaleLowerCase()
  return !value || [item.egcs_cn_name_en, item.egcs_cn_name_fr]
    .some(label => label.toLocaleLowerCase().includes(value))
}))
const pageItems = computed(() => filteredItems.value.slice(pagination.value.pageIndex * pagination.value.pageSize,
  (pagination.value.pageIndex + 1) * pagination.value.pageSize))
const columns: TableColumnInput<LinkedWorkflow>[] = [
  { id: 'name', accessorKey: 'egcs_cn_name_en', headerKey: 'common.name' },
  { id: 'purpose', headerKey: 'workflow.purpose' },
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
let session = 0
let disposed = false
const isCurrentSession = (captured: number) => !disposed && captured === session
watch(isLinkOpen, () => {
  session += 1
}, { flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
})
watch([endpoint, () => entityType, () => canUpdateChild], () => {
  session += 1
  selectedWorkflowId.value = undefined
  isLinkOpen.value = false
  search.value = ''
  pagination.value.pageIndex = 0
}, { flush: 'sync' })
const openLink = () => {
  selectedWorkflowId.value = undefined
  session += 1
  isLinkOpen.value = true
}
const add = async () => {
  if (!canUpdateChild || !selectedWorkflowId.value || isSaving.value) return
  const capturedSession = session
  const capturedEndpoint = endpoint.value
  isSaving.value = true
  try {
    const response = await fetch(getClientRequestUrl(capturedEndpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ egcs_tp_workflow: selectedWorkflowId.value })
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!isCurrentSession(capturedSession)) return
    await refresh()
    if (!isCurrentSession(capturedSession)) return
    selectedWorkflowId.value = undefined
    isLinkOpen.value = false
  } catch (error) {
    if (isCurrentSession(capturedSession)) showError(error)
  } finally {
    isSaving.value = false
  }
}
const remove = async (item: LinkedWorkflow) => {
  if (!canUpdateChild || disposed || isDeleting.value) return
  const capturedSession = session
  isDeleting.value = true
  try {
    const removed = await confirmDeleteRequest(`${endpoint.value}/${item.id}`, {
      shouldProceed: () => isCurrentSession(capturedSession) && canUpdateChild
    })
    if (removed && isCurrentSession(capturedSession)) await refresh()
  } catch (error) {
    if (isCurrentSession(capturedSession)) showError(error)
  } finally {
    isDeleting.value = false
  }
}
const name = (item: LinkedWorkflow) => (locale.value === 'fr' ? item.egcs_cn_name_fr : item.egcs_cn_name_en)
  || item.egcs_cn_name_en || item.egcs_cn_name_fr || item.egcs_tp_workflow
</script>

<template>
  <div class="space-y-5" data-field-scope="transfer-payment.workflow-setups-tab">
    <CommonResourceLayout
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
        <NuxtLink :to="localePath(appRouteLocations.agencyWorkflowSetupDetail(agencyId, row.original.egcs_tp_workflow))" class="font-bold text-zinc-900 hover:text-primary dark:text-white">
          <CommonBilingualName :name-en="row.original.egcs_cn_name_en" :name-fr="row.original.egcs_cn_name_fr" />
        </NuxtLink>
      </template>
      <template #purpose-cell="{ row }">
        {{ t(`workflow.purposes.${row.original.egcs_cn_purpose}`) }}
      </template>
      <template #publicationState-cell="{ row }">
        <CommonLifecycleBadge engine="publication" :state="row.original.publicationState" />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <CommonActionButton
            v-if="canUpdateChild" icon="i-lucide-unlink" variant="ghost" color="error" size="sm"
            :aria-label="t('common.delete_named', { name: name(row.original) })" :disabled="isDeleting" @click="remove(row.original)" />
        </div>
      </template>
    </CommonResourceLayout>
    <UModal :open="isLinkOpen" :title="t('workflow.title')" @update:open="value => { isLinkOpen = value }">
      <template #body>
        <UForm v-if="agencyId" :state="linkState" :validate="createValidator(LinkSchema)" class="space-y-4" @submit="add">
          <UFormField :label="t('workflow.title')" name="egcs_tp_workflow" required>
            <CommonServerLookupSelect
              v-model="selectedWorkflowId" :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/workflows`" value-key="id"
              :include-deleted-query="false" selected-values-query-key="ids" label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr"
              :query="{ limit: 100, ...(entityType ? { entityType } : {}) }" aria-required="true" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="isLinkOpen = false" />
            <CommonSaveButton :label="t('common.add')" :loading="isSaving" :disabled="isSaving" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
