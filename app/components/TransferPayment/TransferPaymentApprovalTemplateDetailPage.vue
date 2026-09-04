<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local request helpers are self-documenting and not public APIs */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import type { Scope } from '~~/shared/utils/scopes'

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const { can } = useCan()

const transferPaymentId = route.params.id as string
const streamId = route.params.streamId as string
const templateId = route.params.templateId as string

const fetchRecord = async (url: string) => {
  const response = await fetch(getClientRequestUrl(url))
  if (!response.ok) {
    await throwFetchResponseError(response)
  }
  return await response.json() as Record<string, unknown>
}

const profile: Ref<Record<string, unknown> | null> = ref(null)
const stream: Ref<Record<string, unknown> | null> = ref(null)
const template: Ref<Record<string, unknown> | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')

const loadDetail = async () => {
  loadStatus.value = 'pending'
  loadError.value = null
  try {
    // Resolve the parent before child resources so a denied parent does not
    // fan out additional requests or expose child-resource existence.
    const nextProfile = await fetchRecord(`/api/transfer-payments/${transferPaymentId}`)
    const [nextStream, nextTemplate] = await Promise.all([
      fetchRecord(`/api/transfer-payments/${transferPaymentId}/streams/${streamId}`),
      fetchRecord(`/api/approval-templates/${templateId}`)
    ])
    profile.value = nextProfile
    stream.value = nextStream
    template.value = nextTemplate
    loadStatus.value = 'success'
  } catch (error: unknown) {
    profile.value = null
    stream.value = null
    template.value = null
    loadError.value = error
    loadStatus.value = 'error'
  }
}

onMounted(() => {
  void loadDetail()
})

const profileScope = computed<Scope>(() => ({
  type: 'entity', agencyId: String(profile.value?.egcs_tp_agency ?? ''),
  path: [{ type: 'transfer_payment', id: transferPaymentId }]
}))
const canManagePublication = computed(() => Boolean(profile.value) && can('transfer_payment', 'update', profileScope.value))

const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  {
    label: getBilingualValue(profile.value as Record<string, unknown> | null, 'egcs_tp_name'),
    to: localePath(appRouteLocations.transferPaymentDetail(transferPaymentId))
  },
  {
    label: getBilingualValue(stream.value as Record<string, unknown> | null, 'egcs_tp_name'),
    to: localePath(appRouteLocations.transferPaymentStreamDetail(transferPaymentId, streamId, { section: 'approval-templates' }))
  },
  { label: getBilingualValue(template.value as Record<string, unknown> | null, 'egcs_cn_name') }
])
</script>

<template>
  <CommonLoadingState v-if="loadStatus === 'pending'" :label="t('common.loading')" />

  <UAlert
    v-else-if="loadError || loadStatus === 'error'"
    role="alert"
    aria-live="assertive"
    color="error"
    icon="i-lucide-circle-alert"
    :title="t('common.resource_table_load_failed')"
    :description="t('common.resource_table_load_failed_description')">
    <template #actions>
      <UButton color="error" variant="soft" :label="t('common.retry')" @click="loadDetail" />
    </template>
  </UAlert>

  <CommonApprovalTemplatesDetailPage
    v-else
    :template-id="templateId"
    :breadcrumb-items="breadcrumbItems"
    :can-manage-publication="canManagePublication"
    hero-collapsed-key="transfer-payment-approval-template-detail" />
</template>
