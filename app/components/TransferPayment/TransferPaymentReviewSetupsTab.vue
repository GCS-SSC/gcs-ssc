<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { appRouteLocations } from '~/utils/route-locations'

const { transferPaymentId, streamId, agencyId, canUpdateChild } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
  canUpdateChild: boolean
  canDeleteChild: boolean
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
const { t } = useI18n()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const { confirmDeleteRequest } = useConfirmDeleteRequest()
const { createValidator } = useZodI18n()
const LinkSchema = z.object({
  egcs_tp_reviewset: z.string({ error: 'validation.required' }).min(1, { error: 'validation.required' })
}).strict()
const state: Ref<{ egcs_tp_reviewset: string } | null> = ref(null)
const isSaving: Ref<boolean> = ref(false)
const endpoint = `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-sets`
const items: Ref<ReviewSetLink[]> = ref([])
const error: Ref<unknown | null> = ref(null)
const status: Ref<'pending' | 'success' | 'error'> = ref('pending')
/** Loads the current Stream links and supports the visible retry action. */
const refresh = async () => {
  status.value = 'pending'
  try {
    const response = await fetch(getClientRequestUrl(endpoint))
    if (!response.ok) await throwFetchResponseError(response)
    const body = await response.json() as { items: ReviewSetLink[] }
    items.value = body.items
    error.value = null
    status.value = 'success'
  } catch (cause: unknown) {
    error.value = cause
    status.value = 'error'
  }
}
await refresh()
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
    const response = await fetch(getClientRequestUrl(endpoint), {
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
    if (await confirmDeleteRequest(`${endpoint}/${link.id}`)) await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">
        {{ t('transfer_payment.review_setups') }}
      </h2>
      <UButton v-if="canUpdateChild && agencyId" icon="i-lucide-link" :label="t('common.add')" @click="openLink" />
    </div>
    <UAlert
      v-if="error"
      role="alert"
      color="error"
      :title="t('common.resource_table_load_failed')"
      :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" color="error" variant="soft" @click="() => refresh()" />
      </template>
    </UAlert>
    <p v-else-if="status === 'pending'" role="status">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="items.length === 0" class="py-8 text-center text-sm text-zinc-500">
      {{ t('common.no_data') }}
    </p>
    <div v-else class="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      <div v-for="link in items" :key="link.id" class="flex items-center gap-3 py-3">
        <NuxtLink v-if="agencyId" :to="localePath(appRouteLocations.agencyReviewSetDetail(agencyId, link.egcs_tp_reviewset))" class="min-w-0 flex-1 font-bold text-zinc-900 hover:text-primary dark:text-white">
          <CommonBilingualName :name-en="link.egcs_cn_name_en" :name-fr="link.egcs_cn_name_fr" />
        </NuxtLink>
        <CommonBilingualName v-else :name-en="link.egcs_cn_name_en" :name-fr="link.egcs_cn_name_fr" class="min-w-0 flex-1" />
        <CommonLifecycleBadge engine="publication" :state="link.publicationState" />
        <UButton
          v-if="canUpdateChild"
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          :aria-label="t('common.delete')"
          @click="removeLink(link)" />
      </div>
    </div>
    <UModal :open="state !== null" :title="t('transfer_payment.review_setups')" @update:open="value => { if (!value) closeLink() }">
      <template #body>
        <UForm v-if="state && agencyId" :state="state" :validate="createValidator(LinkSchema)" class="space-y-4" @submit="saveLink">
          <UFormField :label="t('transfer_payment.review_set')" name="egcs_tp_reviewset" required>
            <CommonServerLookupSelect
              v-model="state.egcs_tp_reviewset"
              :fetch-url="`/api/agency/${agencyId}/review-sets`"
              value-key="id"
              label-en-key="egcs_cn_name_en"
              label-fr-key="egcs_cn_name_fr"
              :query="{ publicationState: 'published' }"
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
