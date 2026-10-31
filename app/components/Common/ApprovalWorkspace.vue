<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Approval evidence is authorized independently of business-record CRUD. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import { SYSTEM_LIFECYCLE } from '~~/shared/constants/system-lifecycle'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import { formatCorrectionReference } from '~~/shared/utils/correction'
import { accountReceivableReference } from '~/utils/account-receivable-display'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { usePageResourceError } from '~/composables/usePageResourceError'
import { useBilingualValue } from '~/composables/useBilingualValue'

defineOptions({ inheritAttrs: false })

type ApprovalTarget =
  | { entityType: 'fundingcaseaccountreceivable' | 'fundingcaseaccountreceivableadjustment' | 'fundingcasecorrection', entityId: string, agreementId: string }
  | { entityType: 'fundingcaseaccountreceivablecreditmemo', entityId: string, proponentId: string }
const { target } = defineProps<{ target: ApprovalTarget }>()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { getHeroCollapsed } = useDashboard()
const presentation = computed(() => {
  switch (target.entityType) {
    case 'fundingcasecorrection':
      return { id: 'agreement-correction-approval', icon: 'i-lucide-file-diff', tab: 'correction.approval_workspace', description: 'correction.approval_workspace_description', title: 'correction.title', parent: 'correction.agreement', contentTestId: 'correction-approval-workspace' }
    case 'fundingcaseaccountreceivablecreditmemo':
      return { id: 'agreement-account-receivable-credit-memo-approval', icon: 'i-lucide-banknote-arrow-down', tab: 'account_receivable.credit_memo_approval_workspace', description: 'account_receivable.approval_workspace_description', title: 'account_receivable.credit_memos_title', parent: 'applicant_recipient.title', contentTestId: 'account-receivable-approval-workspace' }
    case 'fundingcaseaccountreceivable':
    case 'fundingcaseaccountreceivableadjustment':
      return { id: 'agreement-account-receivable-approval', icon: 'i-lucide-hand-coins', tab: 'account_receivable.approval_workspace', description: 'account_receivable.approval_workspace_description', title: 'account_receivable.title', parent: 'account_receivable.agreement', contentTestId: 'account-receivable-approval-workspace' }
    default: {
      const exhaustive: never = target
      return exhaustive
    }
  }
})
const collapsed = computed({
  get: () => getHeroCollapsed(presentation.value.id).value,
  set: value => { getHeroCollapsed(presentation.value.id).value = value }
})
const selectedTab: Ref<string> = ref('approval')
const status: Ref<'pending' | 'success' | 'error'> = ref('pending')
const loadError: Ref<unknown | null> = ref(null)
type ApprovalContext = {
  reference: string
  runtimeState: RuntimeState
} & ({ kind: 'agreement', agreementNumber: string } | { kind: 'proponent', parentNameEn: string, parentNameFr: string })
const ApprovalRuntimeSchema = z.object({
  current: z.object({ runtimeState: z.enum(SYSTEM_LIFECYCLE.runtime.states) }).nullable(),
  submission: z.object({ egcs_fc_packet: z.json() }).nullish()
})
const context: Ref<ApprovalContext | null> = ref(null)
const identity = computed(() => `${target.entityType}:${target.entityId}:${'agreementId' in target ? target.agreementId : target.proponentId}`)
usePageResourceError({ identity, errors: [loadError], pending: () => status.value === 'pending', hasContent: () => Boolean(context.value) })
let generation = 0
let controller: AbortController | null = null
let disposed = false
const refresh = async () => {
  const requestGeneration = ++generation
  const requestIdentity = identity.value
  const requestTarget = target
  controller?.abort()
  controller = new AbortController()
  status.value = 'pending'
  loadError.value = null
  try {
    const url = getClientRequestUrl('/api/workflows/runtime')
    url.searchParams.set('entityType', requestTarget.entityType)
    url.searchParams.set('entityId', requestTarget.entityId)
    url.searchParams.set('purpose', 'approval_submission')
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) await throwFetchResponseError(response)
    const runtime = ApprovalRuntimeSchema.parse(await response.json())
    const packet = runtime.submission?.egcs_fc_packet
    const packetRecord = packet && typeof packet === 'object' && !Array.isArray(packet) ? packet : null
    let acceptedContext: ApprovalContext
    switch (requestTarget.entityType) {
      case 'fundingcaseaccountreceivablecreditmemo': {
        const header = packetRecord?.accountReceivableCreditMemo
        if (!header || typeof header !== 'object' || Array.isArray(header)
          || header.id !== requestTarget.entityId || header.egcs_fc_applicantrecipient !== requestTarget.proponentId
          || typeof header.egcs_fc_number !== 'number' || !runtime.current) throw new Error('Accounts Receivable approval route containment failed')
        acceptedContext = { kind: 'proponent', reference: header.id, parentNameEn: String(header.egcs_fc_debtorname_en ?? ''), parentNameFr: String(header.egcs_fc_debtorname_fr ?? ''), runtimeState: runtime.current.runtimeState }
        break
      }
      case 'fundingcasecorrection': {
        const header = packetRecord?.correction
        if (!header || typeof header !== 'object' || Array.isArray(header)
          || header.id !== requestTarget.entityId || header.egcs_fc_fundingagreement !== requestTarget.agreementId
          || typeof header.egcs_fc_agreementnumber !== 'string' || typeof header.egcs_fc_number !== 'number'
          || !runtime.current) throw new Error('Correction approval route containment failed')
        acceptedContext = { kind: 'agreement', reference: formatCorrectionReference({ egcs_fc_agreementnumber: header.egcs_fc_agreementnumber, egcs_fc_number: header.egcs_fc_number }), agreementNumber: header.egcs_fc_agreementnumber, runtimeState: runtime.current.runtimeState }
        break
      }
      case 'fundingcaseaccountreceivable':
      case 'fundingcaseaccountreceivableadjustment': {
        const header = packetRecord?.accountReceivable
        if (!header || typeof header !== 'object' || Array.isArray(header)
          || header.id !== requestTarget.entityId || header.egcs_fc_fundingagreement !== requestTarget.agreementId
          || typeof header.egcs_fc_agreementnumber !== 'string' || typeof header.egcs_fc_number !== 'number'
          || !runtime.current) throw new Error('Accounts Receivable approval route containment failed')
        acceptedContext = { kind: 'agreement', reference: accountReceivableReference({ id: header.id }), agreementNumber: header.egcs_fc_agreementnumber, runtimeState: runtime.current.runtimeState }
        break
      }
      default: {
        const exhaustive: never = requestTarget
        throw new Error(`Unsupported approval target: ${exhaustive}`)
      }
    }
    if (disposed || generation !== requestGeneration || identity.value !== requestIdentity) return
    context.value = acceptedContext
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
const tabs = computed(() => [{ key: presentation.value.tab, value: 'approval', icon: 'i-lucide-circle-check-big' }])
const parentName = computed(() => context.value?.kind === 'proponent'
  ? getBilingualValue({ name_en: context.value.parentNameEn, name_fr: context.value.parentNameFr }, 'name', '')
  : context.value?.agreementNumber ?? '')
const breadcrumbs = computed(() => [
  { label: t(target.entityType === 'fundingcaseaccountreceivablecreditmemo' ? 'applicant_recipient.title' : 'agreement.title') },
  { label: parentName.value },
  { label: t(presentation.value.title) },
  { label: context.value?.reference ?? '' }
])
const metaItems = computed(() => context.value?.kind === 'proponent'
  ? [getBilingualValue({ name_en: context.value.parentNameEn, name_fr: context.value.parentNameFr }, 'name', t('common.not_available'))]
  : [`${t(presentation.value.parent)}: ${parentName.value}`])
</script>

<template>
  <div v-if="status === 'pending'" role="status" aria-live="polite" class="sr-only">
    <span>{{ t('common.loading_records') }}</span>
  </div>
  <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
    <template #actions>
      <UButton color="error" variant="soft" :label="t('common.retry')" icon="i-lucide-refresh-cw" @click="refresh" />
    </template>
  </UAlert>
  <CommonDetailPage v-else-if="context" :id="presentation.id" v-model:collapsed="collapsed" v-bind="$attrs" :breadcrumb-items="breadcrumbs">
    <template #body>
      <CommonEntityHero :is-collapsed="collapsed" :icon="presentation.icon" :title="context.reference" :description="t(presentation.description)" :meta-items="metaItems" :badges="[{ lifecycleEngine: 'runtime', lifecycleState: context.runtimeState }]" />
      <CommonEntityEditorWorkspace :content-test-id="presentation.contentTestId">
        <template #sidebar>
          <CommonTranslatedTabs v-model="selectedTab" ordering="localized" data-field-container="Page navigation state, not a business input field." :items="tabs" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
        </template>
        <CommonWorkflowSection :entity-type="target.entityType" :entity-id="target.entityId" purpose="approval_submission" :can-edit="false" @changed="refresh" />
      </CommonEntityEditorWorkspace>
    </template>
  </CommonDetailPage>
</template>
