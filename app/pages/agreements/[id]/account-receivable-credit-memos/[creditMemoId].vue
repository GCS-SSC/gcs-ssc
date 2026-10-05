<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Historical Agreement entries resolve the independently authorized Proponent Credit Memo. */
import { computed, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useProponentCreditMemoDetail } from '~/composables/useProponentCreditMemoDetail'
import { appRouteLocations } from '~/utils/route-locations'
import { AppFetchResponseError } from '~/utils/fetch-error'

definePageMeta({ key: route => route.path, i18n: { paths: { en: '/agreements/[id]/account-receivable-credit-memos/[creditMemoId]', fr: '/ententes/[id]/notes-de-credit/[creditMemoId]' } } })
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const agreementId = computed(() => String(route.params.id))
const creditMemoId = computed(() => String(route.params.creditMemoId))
const { data: creditMemo, status, error, refresh } = useProponentCreditMemoDetail(null, creditMemoId)
const approvalOnly = computed(() => !creditMemo.value && status.value === 'error' && error.value instanceof AppFetchResponseError && error.value.response.status === 403)
const content: Ref<HTMLElement | null> = ref(null)
watch(creditMemo, async record => {
  if (!record) return
  await navigateTo(localePath(appRouteLocations.proponentCreditMemoDetail(record.egcs_fc_applicantrecipient, record.id)), { replace: true })
}, { immediate: true })
const retry = async () => {
  if (await refresh()) {
    await nextTick()
    content.value?.focus()
  }
}
</script>

<template>
  <div ref="content" tabindex="-1" class="flex w-full min-w-0 flex-col">
    <AccountReceivableCreditMemoApprovalWorkspace v-if="approvalOnly" :agreement-id="agreementId" :credit-memo-id="creditMemoId" />
    <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
      <template #actions>
        <UButton :label="t('common.retry')" color="error" variant="soft" icon="i-lucide-refresh-cw" @click="retry" />
      </template>
    </UAlert>
    <div v-else role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      <span>{{ t('common.loading_records') }}</span>
    </div>
  </div>
</template>
