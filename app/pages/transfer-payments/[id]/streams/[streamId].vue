<script setup lang="ts">
definePageMeta({
  key: route => route.fullPath,
  i18n: {
    paths: {
      en: '/transfer-payments/[id]/streams/[streamId]',
      fr: '/paiements-de-transfert/[id]/volets/[streamId]'
    }
  }
})

const route = useRoute()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const id = route.params.id as string
const streamId = route.params.streamId as string
const isNestedAssessmentSchemaRoute = computed(() => typeof route.params.schemaId === 'string')
const isNestedApprovalTemplateRoute = computed(() => typeof route.params.templateId === 'string')
const isNestedRecommendationSetupRoute = computed(() => typeof route.params.recommendationSetupId === 'string')
const isNestedWorkflowSetupRoute = computed(() => typeof route.params.workflowSetupId === 'string')
const isNestedReviewSetupRoute = computed(() => typeof route.params.reviewSetupId === 'string')
const isNestedDetailRoute = computed(() => (
  isNestedAssessmentSchemaRoute.value
  || isNestedApprovalTemplateRoute.value
  || isNestedRecommendationSetupRoute.value
  || isNestedWorkflowSetupRoute.value
  || isNestedReviewSetupRoute.value
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
  tabs,
  selectedTab,
  activeTabComponent,
  activeTabProps,
  breadcrumbItems,
  isHeroCollapsed
} =
  await useTransferPaymentStreamDetailState(id, streamId, { immediate: !isNestedDetailRoute.value })

const isLoadingDetail = computed(() => profileStatus.value === 'pending' || streamStatus.value === 'pending')
const hasLoadError = computed(() =>
  profileStatus.value === 'error'
  || streamStatus.value === 'error'
  || Boolean(profileError.value)
  || Boolean(streamError.value)
)
const retryLoad = async () => {
  await Promise.all([refreshProfile(), refreshStream()])
}

watchEffect(() => {
  if (!isNestedDetailRoute.value && hasLoadError.value) showError(profileError.value ?? streamError.value)
})
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
    <UDashboardPanel v-if="stream && profile" id="transfer-payment-stream-detail" class="w-full">
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse />
            <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
          </template>
          <template #right>
            <div class="flex items-center gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
                :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
                @click="isHeroCollapsed = !isHeroCollapsed" />
              <CommonNavbarSide />
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="flex flex-1 flex-col">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed"
            icon="i-lucide-layers"
            :title="getBilingualValue(stream, 'egcs_tp_name', '')"
            :description="getBilingualValue(stream, 'egcs_tp_description', '')" />

          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-visible px-6 pt-0 pb-6 lg:flex-row lg:gap-0">
            <aside class="w-full shrink-0 lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
              <div class="pt-6">
                <CommonRouteTabs
                  v-model="selectedTab"
                  :items="tabs"
                  orientation="vertical"
                  :ui="{
                    root: 'w-full',
                    list: 'w-full flex-col items-stretch p-0',
                    trigger: 'w-full justify-start'
                  }" />
              </div>
            </aside>

            <div class="min-h-0 min-w-0 flex-1 pt-6 lg:pl-6">
              <div v-if="activeTabComponent" class="space-y-6">
                <component :is="activeTabComponent" v-bind="activeTabProps" />
              </div>
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
