<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Approval evidence is authorized independently of Accounts Receivable CRUD. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { JsonValue } from '~~/shared/types/database'
import { formatAccountReceivableCreditMemoSettlementReference } from '~~/shared/utils/account-receivable'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { usePageResourceError } from '~/composables/usePageResourceError'
import { useBilingualValue } from '~/composables/useBilingualValue'

const { agreementId, proponentId, creditMemoId } = defineProps<{ agreementId?: string, proponentId?: string, creditMemoId: string }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agreement-account-receivable-credit-memo-approval')
const selectedTab: Ref<string> = ref('approval')
const status: Ref<'pending' | 'success' | 'error'> = ref('pending')
const loadError: Ref<unknown | null> = ref(null)
type ApprovalContext = {
  reference: string
  parentNameEn: string
  parentNameFr: string
  runtimeState: RuntimeState
}
type ApprovalRuntime = {
  current: { runtimeState: RuntimeState } | null
  submission?: { egcs_fc_packet: JsonValue } | null
}
const context: Ref<ApprovalContext | null> = ref(null)
const identity = computed(() => `${proponentId ?? agreementId}:${creditMemoId}`)
usePageResourceError({
  identity,
  errors: [loadError],
  pending: () => status.value === 'pending',
  hasContent: () => Boolean(context.value)
})
let generation = 0
let controller: AbortController | null = null
let disposed = false
const refresh = async () => {
  const requestGeneration = ++generation
  const requestIdentity = identity.value
  controller?.abort()
  controller = new AbortController()
  status.value = 'pending'
  loadError.value = null
  try {
    const url = getClientRequestUrl('/api/workflows/runtime')
    url.searchParams.set('entityType', 'fundingcaseaccountreceivablecreditmemo')
    url.searchParams.set('entityId', creditMemoId)
    url.searchParams.set('purpose', 'approval_submission')
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) await throwFetchResponseError(response)
    const runtime = await response.json() as ApprovalRuntime
    const packet = runtime.submission?.egcs_fc_packet
    const packetRecord = packet && typeof packet === 'object' && !Array.isArray(packet) ? packet : null
    const header = packetRecord?.accountReceivableCreditMemo
    if (!header || typeof header !== 'object' || Array.isArray(header)
      || header.id !== creditMemoId
      || (proponentId !== undefined ? header.egcs_fc_applicantrecipient !== proponentId : header.egcs_fc_fundingagreement !== agreementId)
      || typeof header.egcs_fc_number !== 'number'
      || !runtime.current) throw new Error('Accounts Receivable approval route containment failed')
    if (disposed || generation !== requestGeneration || identity.value !== requestIdentity) return
    context.value = {
      reference: typeof header.egcs_fc_creditmemoreference === 'string' ? header.egcs_fc_creditmemoreference : packetRecord?.schemaVersion === 2 || header.egcs_fc_ledgerkind === 'pool' ? `CM-${header.id}` : typeof packetRecord?.recoveryId === 'string' ? formatAccountReceivableCreditMemoSettlementReference(packetRecord.recoveryId) : typeof header.egcs_fc_agreementnumber === 'string' ? t('account_receivable.credit_memo_reference', { agreement: header.egcs_fc_agreementnumber, number: header.egcs_fc_number }) : `CM-${header.egcs_fc_number}`,
      parentNameEn: proponentId !== undefined ? String(header.egcs_fc_debtorname_en ?? '') : String(header.egcs_fc_agreementnumber ?? ''),
      parentNameFr: proponentId !== undefined ? String(header.egcs_fc_debtorname_fr ?? '') : String(header.egcs_fc_agreementnumber ?? ''),
      runtimeState: runtime.current.runtimeState
    }
    status.value = 'success'
  } catch (failure: unknown) {
    if (disposed || generation !== requestGeneration || identity.value !== requestIdentity) return
    loadError.value = failure
    status.value = 'error'
  }
}
watch(identity, () => {
  context.value = null
  void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  generation += 1
  controller?.abort()
})
const tabs = [{ key: 'account_receivable.credit_memo_approval_workspace', value: 'approval', icon: 'i-lucide-circle-check-big' }]
const breadcrumbs = computed(() => [
  { label: t(proponentId !== undefined ? 'applicant_recipient.title' : 'agreement.title') },
  { label: getBilingualValue({ name_en: context.value?.parentNameEn, name_fr: context.value?.parentNameFr }, 'name', '') },
  { label: t('account_receivable.credit_memos_title') },
  { label: context.value?.reference ?? '' }
])
</script>

<template>
  <div v-if="status === 'pending'" role="status" aria-live="polite" class="flex min-h-32 items-center justify-center gap-2 text-sm text-muted">
    <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" /><span>{{ t('common.loading_records') }}</span>
  </div>
  <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
    <template #actions>
      <UButton color="error" variant="soft" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="refresh" />
    </template>
  </UAlert>
  <UDashboardPanel v-else-if="context" id="agreement-account-receivable-credit-memo-approval" class="min-w-0 flex-1">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse /><UBreadcrumb :items="breadcrumbs" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" /><CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-banknote-arrow-down" :title="context.reference" :description="t('account_receivable.approval_workspace_description')" :meta-items="[getBilingualValue({ name_en: context.parentNameEn, name_fr: context.parentNameFr }, 'name', t('common.not_available'))]" :badges="[{ lifecycleEngine: 'runtime', lifecycleState: context.runtimeState }]" />
      <CommonEntityEditorWorkspace content-test-id="account-receivable-approval-workspace">
        <template #sidebar>
          <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
        </template>
        <CommonWorkflowSection entity-type="fundingcaseaccountreceivablecreditmemo" :entity-id="creditMemoId" purpose="approval_submission" :can-edit="false" @changed="refresh" />
      </CommonEntityEditorWorkspace>
    </template>
  </UDashboardPanel>
</template>
