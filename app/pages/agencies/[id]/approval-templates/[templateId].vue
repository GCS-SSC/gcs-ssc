<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- page-local loading and navigation */
import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]/approval-templates/[templateId]',
      fr: '/agences/[id]/modeles-approbation/[templateId]'
    }
  }
})

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { can } = useCan()
const { getBilingualValue } = useBilingualValue()
const agencyId = String(route.params.id)
const templateId = String(route.params.templateId)
const agency: Ref<Record<string, unknown> | null> = ref(null)
const template: Ref<Record<string, unknown> | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')

const fetchRecord = async (url: string) => {
  const response = await fetch(getClientRequestUrl(url))
  if (!response.ok) await throwFetchResponseError(response)
  return await response.json() as Record<string, unknown>
}
const loadDetail = async () => {
  loadStatus.value = 'pending'
  try {
    const nextAgency = await fetchRecord(`/api/agency/${agencyId}`)
    const nextTemplate = await fetchRecord(`/api/agency/${agencyId}/approval-templates/${templateId}`)
    agency.value = nextAgency
    template.value = nextTemplate
    loadError.value = null
    loadStatus.value = 'success'
  } catch (error: unknown) {
    agency.value = null
    template.value = null
    loadError.value = error
    loadStatus.value = 'error'
  }
}
await loadDetail()

const canManagePublication = computed(() => can('agency', 'update', { type: 'agency', agencyId }))
const breadcrumbItems = computed(() => [
  { label: t('nav.agencies'), to: localePath(appRouteLocations.agencies()) },
  {
    label: getBilingualValue(agency.value, 'egcs_ay_name'),
    to: localePath({ ...appRouteLocations.agencyDetail(agencyId), query: { section: 'approvalTemplates' } })
  },
  { label: getBilingualValue(template.value, 'egcs_cn_name') }
])
</script>

<template>
  <UAlert
    v-if="loadError || loadStatus === 'error'"
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
    v-else-if="loadStatus === 'success'"
    :agency-id="agencyId"
    :template-id="templateId"
    :breadcrumb-items="breadcrumbItems"
    :can-manage-publication="canManagePublication"
    hero-collapsed-key="agency-approval-template-detail" />
</template>
