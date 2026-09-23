<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
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
const { transferPaymentId, streamId, agencyId, canUpdateChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId: string
  canUpdateChild: boolean
  canDeleteChild: boolean
}>()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const selectedWorkflowId: Ref<string | undefined> = ref(undefined)
const items: Ref<LinkedWorkflow[]> = ref([])
const pending = ref(false)
const isSaving = ref(false)
const endpoint = computed(() => `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/workflows`)
const refresh = async () => {
  pending.value = true
  try {
    const response = await fetch(getClientRequestUrl(endpoint.value))
    if (!response.ok) await throwFetchResponseError(response)
    items.value = (await response.json() as { items: LinkedWorkflow[] }).items
  } catch (error) {
    showError(error)
  } finally {
    pending.value = false
  }
}
watch(endpoint, () => {
  selectedWorkflowId.value = undefined
  items.value = []
  void refresh()
}, { immediate: true })
const add = async () => {
  if (!selectedWorkflowId.value || isSaving.value) return
  isSaving.value = true
  try {
    const response = await fetch(getClientRequestUrl(endpoint.value), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ egcs_tp_workflow: selectedWorkflowId.value })
    })
    if (!response.ok) await throwFetchResponseError(response)
    selectedWorkflowId.value = undefined
    await refresh()
  } catch (error) {
    showError(error)
  } finally {
    isSaving.value = false
  }
}
const remove = async (item: LinkedWorkflow) => {
  try {
    if (await confirmDeleteRequest(`${endpoint.value}/${item.id}`)) await refresh()
  } catch (error) {
    showError(error)
  }
}
const name = (item: LinkedWorkflow) => (locale.value === 'fr' ? item.egcs_cn_name_fr : item.egcs_cn_name_en)
  || item.egcs_cn_name_en || item.egcs_cn_name_fr || item.egcs_tp_workflow
</script>

<template>
  <div class="space-y-5">
    <div v-if="canUpdateChild && agencyId" class="flex flex-wrap items-end gap-3">
      <AdminCommonLookupField
        v-model="selectedWorkflowId" :label="t('workflow.title')" name="egcs_tp_workflow"
        :fetch-url="`/api/agency/${agencyId}/workflows`" value-key="id"
        label-en-key="egcs_cn_name_en" label-fr-key="egcs_cn_name_fr" :query="{ limit: 100, publicationState: 'published' }"
        class="min-w-64 flex-1" />
      <UButton icon="i-lucide-link" :label="t('common.add')" :loading="isSaving" :disabled="!selectedWorkflowId || isSaving" @click="add" />
    </div>
    <div v-if="pending" class="text-sm text-zinc-500">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="items.length" class="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <div v-for="item in items" :key="item.id" class="flex items-center gap-3 p-3">
        <NuxtLink :to="localePath(appRouteLocations.agencyWorkflowSetupDetail(agencyId, item.egcs_tp_workflow))" class="min-w-0 flex-1 font-bold text-zinc-900 hover:text-primary dark:text-white">
          <CommonBilingualName :name-en="item.egcs_cn_name_en" :name-fr="item.egcs_cn_name_fr" />
        </NuxtLink>
        <span class="text-sm text-zinc-500">{{ t(`workflow.purposes.${item.egcs_cn_purpose}`) }}</span>
        <CommonLifecycleBadge engine="publication" :state="item.publicationState" />
        <UButton v-if="canUpdateChild" icon="i-lucide-unlink" variant="ghost" color="error" :aria-label="t('common.delete_named', { name: name(item) })" @click="remove(item)" />
      </div>
    </div>
    <p v-else class="text-sm text-zinc-500">
      {{ t('workflow.no_members') }}
    </p>
  </div>
</template>
