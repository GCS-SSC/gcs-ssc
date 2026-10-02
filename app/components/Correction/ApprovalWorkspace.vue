<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Approval evidence is authorized independently of Correction CRUD. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { JsonValue } from '~~/shared/types/database'
import { formatCorrectionReference } from '~~/shared/utils/correction'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

const { agreementId, correctionId } = defineProps<{ agreementId: string, correctionId: string }>()
const { t } = useI18n()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('agreement-correction-approval')
const selectedTab: Ref<string> = ref('approval')
const status: Ref<'pending' | 'success' | 'error'> = ref('pending')
type ApprovalContext = {
  reference: string
  agreementNumber: string
  runtimeState: RuntimeState
}
type ApprovalRuntime = {
  current: { runtimeState: RuntimeState } | null
  submission?: { egcs_fc_packet: JsonValue } | null
}
const context: Ref<ApprovalContext | null> = ref(null)
const identity = computed(() => `${agreementId}:${correctionId}`)
let generation = 0
let controller: AbortController | null = null
let disposed = false
const refresh = async () => {
  const requestGeneration = ++generation
  const requestIdentity = identity.value
  controller?.abort()
  controller = new AbortController()
  status.value = 'pending'
  context.value = null
  try {
    const url = getClientRequestUrl('/api/workflows/runtime')
    url.searchParams.set('entityType', 'fundingcasecorrection')
    url.searchParams.set('entityId', correctionId)
    url.searchParams.set('purpose', 'approval_submission')
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) await throwFetchResponseError(response)
    const runtime = await response.json() as ApprovalRuntime
    const packet = runtime.submission?.egcs_fc_packet
    const header = packet && typeof packet === 'object' && !Array.isArray(packet) ? packet.correction : null
    if (!header || typeof header !== 'object' || Array.isArray(header)
      || header.id !== correctionId || header.egcs_fc_fundingagreement !== agreementId
      || typeof header.egcs_fc_agreementnumber !== 'string' || typeof header.egcs_fc_number !== 'number'
      || !runtime.current) throw new Error('Correction approval route containment failed')
    if (disposed || generation !== requestGeneration || identity.value !== requestIdentity) return
    context.value = {
      reference: formatCorrectionReference({ egcs_fc_agreementnumber: header.egcs_fc_agreementnumber, egcs_fc_number: header.egcs_fc_number }),
      agreementNumber: header.egcs_fc_agreementnumber,
      runtimeState: runtime.current.runtimeState
    }
    status.value = 'success'
  } catch {
    if (disposed || generation !== requestGeneration || identity.value !== requestIdentity) return
    status.value = 'error'
  }
}
watch(identity, refresh, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  disposed = true
  generation += 1
  controller?.abort()
})
const tabs = [{ key: 'correction.approval_workspace', value: 'approval', icon: 'i-lucide-circle-check-big' }]
const breadcrumbs = computed(() => [
  { label: t('agreement.title') },
  { label: context.value?.agreementNumber ?? '' },
  { label: t('correction.title') },
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
  <UDashboardPanel v-else-if="context" id="agreement-correction-approval" class="min-w-0 flex-1">
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
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-file-diff" :title="context.reference" :description="t('correction.approval_workspace_description')" :meta-items="[`${t('correction.agreement')}: ${context.agreementNumber}`]" :badges="[{ lifecycleEngine: 'runtime', lifecycleState: context.runtimeState }]" />
      <CommonEntityEditorWorkspace content-test-id="correction-approval-workspace">
        <template #sidebar>
          <CommonRouteTabs v-model="selectedTab" :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
        </template>
        <CommonWorkflowSection entity-type="fundingcasecorrection" :entity-id="correctionId" purpose="approval_submission" :can-edit="false" @changed="refresh" />
      </CommonEntityEditorWorkspace>
    </template>
  </UDashboardPanel>
</template>
