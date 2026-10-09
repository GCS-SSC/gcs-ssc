<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import { provideBilingualFieldScope } from '~/utils/bilingual-field-context'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { useLoadRecoveryFocus } from '~/composables/useLoadRecoveryFocus'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { TransferPaymentStreamItem } from '~~/shared/types/schemas'
import type { TransferPaymentStreamRow } from '~~/shared/types/transfer-payment-ui'

definePageMeta({
  key: route => route.path,
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]'
    }
  }
})

const route = useRoute()
const { t } = useI18n()
const toast = useToast()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const id = route.params.id as string
const streamId = route.params.streamId as string
provideBilingualFieldScope(() => ({ subject: 'transfer_payment', streamId, permissionAction: 'update' }))

const isNestedAssessmentSchemaRoute = computed(() => typeof route.params.schemaId === 'string')
const isNestedApprovalTemplateRoute = computed(() => typeof route.params.templateId === 'string')
const isNestedRecommendationSetupRoute = computed(() => typeof route.params.recommendationSetupId === 'string')
const isNestedDetailRoute = computed(() => (
  isNestedAssessmentSchemaRoute.value
  || isNestedApprovalTemplateRoute.value
  || isNestedRecommendationSetupRoute.value
))

const {
  profile,
  stream,
  profileError,
  streamError,
  profileStatus,
  streamStatus,
  refreshProfile,
  refreshStream,
  canUpdateChild,
  tabs,
  selectedTab,
  activeTabComponent,
  activeTabProps,
  breadcrumbItems,
  isHeroCollapsed
} =
  await useTransferPaymentStreamDetailState(id, streamId, { immediate: !isNestedDetailRoute.value })

usePageResourceError({
  identity: () => route.path,
  errors: [() => isNestedDetailRoute.value ? null : profileError.value, () => isNestedDetailRoute.value ? null : streamError.value],
  pending: () => profileStatus.value === 'pending' || streamStatus.value === 'pending',
  hasContent: () => Boolean(profile.value && stream.value)
})

const isUpdateModalOpen: Ref<boolean> = ref(false)
const isSavingStream: Ref<boolean> = ref(false)
const selectedStream: Ref<Partial<TransferPaymentStreamItem> | null> = ref(null)
const persistedStream: Ref<TransferPaymentStreamRow | null> = ref(null)

/** Copies the current Stream into the shared edit modal. */
const openUpdateStream = () => {
  if (!stream.value || !canUpdateChild.value || isSavingStream.value) return
  persistedStream.value = { ...stream.value } as TransferPaymentStreamRow
  selectedStream.value = { ...stream.value }
  isUpdateModalOpen.value = true
}

/** Saves the edited Stream and refreshes the detail view. */
const saveStream = async () => {
  if (!selectedStream.value || !canUpdateChild.value || isSavingStream.value) return
  const draft = selectedStream.value
  isSavingStream.value = true
  try {
    const response = await fetch(getClientRequestUrl(`/api/transfer-payments/${id}/streams/${streamId}`), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, egcs_tp_parentstream: draft.egcs_tp_parentstream || null })
    })
    if (!response.ok) await throwFetchResponseError(response)
    await refreshStream()
    if (streamStatus.value === 'error' || streamError.value) return
    if (selectedStream.value === draft) {
      isUpdateModalOpen.value = false
      selectedStream.value = null
      persistedStream.value = null
    }
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingStream.value = false
  }
}

const isLoadingDetail = computed(() => profileStatus.value === 'pending' || streamStatus.value === 'pending')
const hasLoadError = computed(() =>
  profileStatus.value === 'error'
  || streamStatus.value === 'error'
  || Boolean(profileError.value)
  || Boolean(streamError.value)
)
const { recoveryFocusTarget, focusRecoveredContent } = useLoadRecoveryFocus()
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshStream()])
  if (profile.value && stream.value && !hasLoadError.value) await focusRecoveredContent()
}
</script>

<template>
  <NuxtPage v-if="isNestedDetailRoute" />
  <div v-else class="flex w-full flex-col">
    <div v-if="isLoadingDetail && (!stream || !profile)" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
    <UAlert
      v-else-if="hasLoadError"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('common.resource_table_load_failed')"
      :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" :loading="isLoadingDetail" @click="retryLoad" />
      </template>
    </UAlert>
    <CommonDetailPage v-if="stream && profile" id="transfer-payment-stream-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems" class="w-full">
      <template #body>
        <div ref="recoveryFocusTarget" tabindex="-1" class="flex flex-1 flex-col outline-none">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-layers"
            :title="getBilingualValue(stream, 'egcs_tp_name', '')"
            :description="getBilingualValue(stream, 'egcs_tp_description', '')"
            :meta-items="[
              `${t('agreement.program')}: ${getBilingualValue(profile, 'egcs_tp_name', '')}`,
              `${t('transfer_payment.abbreviation')}: ${getBilingualValue(stream, 'egcs_tp_abbreviation', '')}`
            ]"
            :badges="[{ variant: stream.egcs_tp_active ? 'active' : 'inactive' }]"
            :actions="[{
              label: t('common.edit'),
              icon: 'i-lucide-edit-3',
              visible: canUpdateChild,
              onClick: openUpdateStream
            }]" />

          <CommonDetailWorkspace v-model="selectedTab" :items="tabs">
            <div v-if="activeTabComponent" class="space-y-6">
              <component :is="activeTabComponent" v-bind="activeTabProps" />
            </div>
          </CommonDetailWorkspace>
        </div>
      </template>
    </CommonDetailPage>

    <TransferPaymentStreamModal
      v-if="selectedStream && canUpdateChild"
      v-model:open="isUpdateModalOpen"
      v-model:state="selectedStream"
      :title="t('common.edit')"
      :submit-label="t('common.update')"
      :program-id="id"
      :persisted-stream="persistedStream ?? undefined"
      :persisted-program-id="id"
      :pending="isSavingStream"
      @submit="saveStream" />
  </div>
</template>
