<script setup lang="ts">
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import { z } from 'zod'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'
import { useCrudModal, useCrudModalPending } from '~/composables/useCrudModal'

const writeContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
const deleteActionContext = useActionContext({
  identity: [() => transferPaymentId, () => streamId, () => agencyId],
  authority: () => canUpdateChild
})
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
type LinkDraft = { egcs_tp_reviewset: string }
type ViewLifecycle = { kind: 'active' } | { kind: 'disposed' }
const lifecycle: Ref<ViewLifecycle> = shallowRef({ kind: 'active' })
const modal = useCrudModal<LinkDraft, LinkDraft>({
  createState: () => ({ egcs_tp_reviewset: '' }),
  updateState: item => ({ ...item })
})
const { selected: state, isOpen: isLinkOpen } = modal
const pending = useCrudModalPending(modal.captureSession)
const isSaving = pending.isPending
const isCurrentContext = (captured: ViewLifecycle) => captured.kind === 'active' && captured === lifecycle.value
onBeforeUnmount(() => {
  lifecycle.value = { kind: 'disposed' }
  modal.close()
})
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
watch([endpoint, () => agencyId, () => canUpdateChild], () => {
  if (lifecycle.value.kind === 'disposed') return
  lifecycle.value = { kind: 'active' }
  modal.close()
  search.value = ''
  pagination.value.pageIndex = 0
}, { flush: 'sync' })
const openLink = () => {
  if (lifecycle.value.kind === 'active' && canUpdateChild && agencyId) modal.openCreate()
}
const closeLink = modal.close
/** Saves a selected Agency Review Set link on this Stream. */
const saveLink = async () => {
  const operation = writeContext.capture()
  if (!operation) return
  if (!state.value || !canUpdateChild || lifecycle.value.kind === 'disposed') return
  const session = modal.captureSession()
  if (!pending.begin(session)) return
  const context = lifecycle.value
  const capturedEndpoint = endpoint.value
  const body = JSON.stringify(state.value)
  try {
    const response = await fetch(getClientRequestUrl(capturedEndpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    if (!response.ok) await throwFetchResponseError(response)
    if (!(operation.isCurrent() && isCurrentContext(context))) return
    const closedSession = modal.closeSession(session)
    try {
      await refresh()
    } catch (error: unknown) {
      if ((operation.isCurrent() && isCurrentContext(context)) && (modal.isCurrentSession(session) || (closedSession && modal.isLatestSession(session)))) showError(error)
    }
  } catch (error: unknown) {
    if ((operation.isCurrent() && isCurrentContext(context)) && modal.isCurrentSession(session)) showError(error)
  } finally {
    pending.end(session)
  }
}
/**
 * Removes a Stream Review Set link.
 * @param link - The selected link.
 */
const removeLink = async (link: ReviewSetLink) => {
  const operation = deleteActionContext.capture()
  if (!operation) return
  const id = link.id
  if (!canUpdateChild || lifecycle.value.kind === 'disposed') return
  const context = lifecycle.value
  const capturedEndpoint = endpoint.value
  try {
    const removed = await confirmDeleteRequest(`${capturedEndpoint}/${id}`, {
      operation, target: { id, resolve: () => items.value.find(current => current.id === id), eligible: current => current.id === id },
      shouldProceed: () => operation.isCurrent() && isCurrentContext(context) && canUpdateChild
    })
    if (removed && operation.isCurrent() && isCurrentContext(context)) await refresh()
  } catch (error: unknown) {
    if (operation.isCurrent() && isCurrentContext(context)) showError(error)
  }
}
const formSession = useFormSession({ owner: modal, action: { kind: 'remote', context: writeContext }, submit: saveLink })
</script>

<template>
  <section class="space-y-4" data-field-scope="transfer-payment.review-setups-tab">
    <h2 v-if="showHeader" class="text-lg font-semibold">
      {{ t('transfer_payment.review_setups') }}
    </h2>
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
    </CommonResourceLayout>
    <UModal :open="isLinkOpen" :title="t('transfer_payment.review_setups')" @update:open="value => { if (!value) closeLink() }">
      <template #body>
        <UForm v-if="state && agencyId" v-bind="formSession" :state="state" :validate="createValidator(LinkSchema)" class="space-y-4">
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
