<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { z } from 'zod'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'
import type { PublicationState } from '~~/shared/constants/system-lifecycle'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'

type LinkedWorkflow = {
  id: string
  egcs_tp_workflow: string
  egcs_cn_name_en: string
  egcs_cn_name_fr: string
  egcs_cn_entitytype: string
  egcs_cn_purpose: string
  publicationState: PublicationState
}
const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId, () => entityType],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
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
type LinkDraft = { egcs_tp_workflow: string }
type ViewLifecycle = { kind: 'active' } | { kind: 'disposed' }
const lifecycle: Ref<ViewLifecycle> = shallowRef({ kind: 'active' })
const modal = useCrudModal<LinkDraft, LinkDraft>({
  createState: () => ({ egcs_tp_workflow: '' }),
  updateState: item => ({ ...item })
})
const { selected: linkState, isOpen: isLinkOpen } = modal
const pending = useCrudModalPending(modal.captureSession)
const isSaving = pending.isPending
const isDeleting = ref(false)
const { createValidator } = useZodI18n()
const LinkSchema = z.object({
  egcs_tp_workflow: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
}).strict()
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
const isCurrentContext = (captured: ViewLifecycle) => captured.kind === 'active' && captured === lifecycle.value
watch(modal.captureSession, () => {
  if (lifecycle.value.kind === 'active') lifecycle.value = { kind: 'active' }
}, { flush: 'sync' })
onBeforeUnmount(() => {
  lifecycle.value = { kind: 'disposed' }
  modal.close()
})
watch([endpoint, () => agencyId, () => entityType, () => canUpdateChild], () => {
  if (lifecycle.value.kind === 'disposed') return
  lifecycle.value = { kind: 'active' }
  modal.close()
  search.value = ''
  pagination.value.pageIndex = 0
}, { flush: 'sync' })
const openLink = () => {
  if (lifecycle.value.kind === 'active' && canUpdateChild && agencyId) modal.openCreate()
}
const add = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  if (!canUpdateChild || !linkState.value?.egcs_tp_workflow || lifecycle.value.kind === 'disposed') return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const capturedEndpoint = endpoint.value
  const body = JSON.stringify(linkState.value)
  try {
    const response = await fetch(getClientRequestUrl(capturedEndpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!operation.isCurrent()) return
    await refresh()
    if (!operation.isCurrent() || !modal.isCurrentSession(session)) return
    modal.closeSession(session)
  } catch (error) {
    if (operation.isCurrent() && modal.isCurrentSession(session)) showError(error)
  } finally {
    pending.end(session)
  }
}
const remove = async (item: LinkedWorkflow) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = item.id
  if (!canUpdateChild || lifecycle.value.kind === 'disposed' || isDeleting.value) return
  const context = lifecycle.value
  const capturedEndpoint = endpoint.value
  isDeleting.value = true
  try {
    const removed = await confirmDeleteRequest(`${capturedEndpoint}/${id}`, {
      operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id },
      shouldProceed: () => operation.isCurrent() && isCurrentContext(context) && canUpdateChild
    })
    if (removed && operation.isCurrent() && isCurrentContext(context)) await refresh()
  } catch (error) {
    if (operation.isCurrent() && isCurrentContext(context)) showError(error)
  } finally {
    isDeleting.value = false
  }
}
const name = (item: LinkedWorkflow) => (locale.value === 'fr' ? item.egcs_cn_name_fr : item.egcs_cn_name_en)
  || item.egcs_cn_name_en || item.egcs_cn_name_fr || item.egcs_tp_workflow
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: writeContext }, submit: add })
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
        <UForm v-if="linkState && agencyId" v-bind="formSession" :state="linkState" :validate="createValidator(LinkSchema)" class="space-y-4">
          <UFormField :label="t('workflow.title')" name="egcs_tp_workflow" required>
            <CommonServerLookupSelect
              v-model="linkState.egcs_tp_workflow" :fetch-url="`/api/transfer-payments/${transferPaymentId}/streams/${streamId}/lookups/workflows`" value-key="id"
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
