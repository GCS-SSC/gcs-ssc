<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RouteParamsGeneric } from 'vue-router'
import { appRouteLocations } from '~/utils/route-locations'

definePageMeta({
  key: route => {
    const params: RouteParamsGeneric = route.params
    return JSON.stringify([params.id, params.extensionKey, params.tabId, params.recordId])
  },
  i18n: {
    paths: {
      en: '/agreements/[id]/extension/[extensionKey]/[tabId]/[recordId]',
      fr: '/ententes/[id]/extension/[extensionKey]/[tabId]/[recordId]'
    }
  }
})

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const collapsed = ref(false)
const breadcrumbs = computed(() => [{ label: t('agreement.title'), to: localePath(appRouteLocations.agreements()) }])
const agreementId = computed(() => String(route.params.id))
const extensionKey = computed(() => String(route.params.extensionKey))
const tabId = computed(() => String(route.params.tabId))
const recordId = computed(() => String(route.params.recordId))
const { items, status, refresh } = useExtensionEntityTabs({ target: 'agreement', agreementId })
const item = computed(() => items.value.find(tab =>
  tab.extensionKey === extensionKey.value && tab.tabId === tabId.value && tab.detailComponentName
))
</script>

<template>
  <div class="flex min-h-0 w-full min-w-0 flex-1 flex-col">
    <ExtensionEntityTabPanel v-if="status === 'success' && item" :item="item" :record-id="recordId" />
    <CommonDetailPage v-else id="agreement-extension-record-loading" v-model:collapsed="collapsed" :breadcrumb-items="breadcrumbs">
      <template #body>
        <div v-if="status === 'idle' || status === 'pending'" role="status" aria-live="polite" class="sr-only">
          <span>{{ t('common.loading_records') }}</span>
        </div>
        <UAlert v-else-if="status === 'error'" color="error" icon="i-lucide-circle-alert" :title="t('common.resource_table_load_failed')" :description="t('common.resource_table_load_failed_description')">
          <template #actions>
            <UButton color="error" variant="soft" icon="i-lucide-refresh-cw" :label="t('common.retry')" @click="refresh" />
          </template>
        </UAlert>
        <UAlert v-else color="warning" icon="i-lucide-lock-keyhole" :title="t('common.unavailable')" />
      </template>
    </CommonDetailPage>
  </div>
</template>
