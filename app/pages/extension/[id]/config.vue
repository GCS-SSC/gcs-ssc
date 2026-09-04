<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type { Ref } from 'vue'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { appRouteLocations } from '~/utils/route-locations'
import type { ExtensionStreamRegistryItem } from '~~/shared/types/schemas/extensions'
import type { GcsExtensionJsonConfig } from '~~/shared/utils/extensions'
import type { TransferPaymentProfileItem, TransferPaymentStreamItem } from '~~/shared/types/schemas'

definePageMeta({
  i18n: {
    paths: {
      en: '/extension/[id]/config',
      fr: '/extension/[id]/configuration'
    }
  }
})

type ExtensionStreamRegistryResponse = {
  items: ExtensionStreamRegistryItem[]
}

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const { getBilingualValue } = useBilingualValue()
const extensionKey = route.params.id as string
const streamId = computed(() => typeof route.query.streamId === 'string' ? route.query.streamId : '')
const transferPaymentId = computed(() => typeof route.query.transferPaymentId === 'string' ? route.query.transferPaymentId : '')
const agencyId = computed(() => typeof route.query.agencyId === 'string' ? route.query.agencyId : '')

const item: Ref<ExtensionStreamRegistryItem | null> = ref(null)
const profile: Ref<TransferPaymentProfileItem | null> = ref(null)
const stream: Ref<(TransferPaymentStreamItem & { parent_name_en?: string; parent_name_fr?: string }) | null> = ref(null)
const draftConfig: Ref<GcsExtensionJsonConfig> = ref({})
const isLoading: Ref<boolean> = ref(false)
const loadError: Ref<unknown | null> = ref(null)

const extensionName = computed(() => {
  const extension = item.value?.extension
  if (!extension) {
    return extensionKey
  }

  return locale.value === 'fr' ? extension.name.fr : extension.name.en
})

const extensionDescription = computed(() => {
  const extension = item.value?.extension
  if (!extension) {
    return ''
  }

  return locale.value === 'fr' ? extension.description?.fr : extension.description?.en
})

const configComponent = computed(() => {
  const componentName = item.value?.extension.admin.streamConfigPage?.componentName
    || item.value?.extension.admin.streamConfig?.componentName
  return componentName ? getGcsExtensionComponent(componentName) : null
})

const breadcrumbItems = computed(() => [
  { label: t('transfer_payment.title'), to: localePath(appRouteLocations.transferPayments()) },
  ...(profile.value
    ? [{ label: getBilingualValue(profile.value, 'egcs_tp_name'), to: localePath(appRouteLocations.transferPaymentDetail(String(profile.value.id))) }]
    : []),
  ...(profile.value && stream.value
    ? [{
        label: getBilingualValue(stream.value, 'egcs_tp_name'),
        to: localePath(appRouteLocations.transferPaymentStreamDetail(String(profile.value.id), String(stream.value.id), { section: 'extensions' }))
      }]
    : []),
  { label: extensionName.value }
])

const resetDraft = (config: GcsExtensionJsonConfig): void => {
  draftConfig.value = JSON.parse(JSON.stringify(config)) as GcsExtensionJsonConfig
}

const fetchOptionalJson = async (responsePromise: Promise<Response | null>): Promise<unknown | null> => {
  try {
    const response = await responsePromise
    if (!response) {
      return null
    }

    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    return await response.json() as unknown
  } catch {
    return null
  }
}

const refresh = async () => {
  if (!streamId.value) {
    loadError.value = new Error(t('extensions.config_missing_stream'))
    return
  }

  try {
    isLoading.value = true
    loadError.value = null
    const profileJson = transferPaymentId.value
      ? fetchOptionalJson(fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId.value}`)))
      : Promise.resolve(null)
    const streamJson = transferPaymentId.value
      ? fetchOptionalJson(fetch(getClientRequestUrl(`/api/transfer-payments/${transferPaymentId.value}/streams/${streamId.value}`)))
      : Promise.resolve(null)
    const extensionResponse = await fetch(getClientRequestUrl(`/api/extensions/streams/${streamId.value}`))

    if (!extensionResponse.ok) await throwFetchResponseError(extensionResponse)

    const payload = await extensionResponse.json() as ExtensionStreamRegistryResponse
    item.value = payload.items.find(row => row.extension.key === extensionKey) ?? null
    profile.value = await profileJson as TransferPaymentProfileItem | null
    stream.value = await streamJson as TransferPaymentStreamItem | null

    if (!item.value) {
      throw new Error(t('apiErrors.extensions.not_found'))
    }

    resetDraft(item.value.config)
  } catch (error: unknown) {
    loadError.value = error
    showError(error)
  } finally {
    isLoading.value = false
  }
}

await refresh()
</script>

<template>
  <UDashboardPanel id="extension-config" class="w-full">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero
          icon="i-lucide-puzzle"
          :title="extensionName"
          :description="extensionDescription || t('extensions.config_page_description')"
          :is-collapsed="false" />

        <div v-if="loadError" class="px-6 pt-6">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="t('common.error')"
            :description="streamId ? t('common.resource_table_load_failed_description') : t('extensions.config_missing_stream')">
            <template #actions>
              <UButton
                v-if="streamId"
                color="error"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :label="t('common.retry')"
                :loading="isLoading"
                :disabled="isLoading"
                @click="refresh" />
              <UButton
                v-else
                color="neutral"
                variant="soft"
                icon="i-lucide-arrow-left"
                :label="t('transfer_payment.title')"
                :to="localePath(appRouteLocations.transferPayments())" />
            </template>
          </UAlert>
        </div>

        <CommonLoadingState v-else-if="isLoading" :label="t('common.loading_records')" class="px-6 pt-6" />

        <component
          :is="configComponent"
          v-else-if="item && configComponent"
          v-model="draftConfig"
          :extension="item.extension"
          :stream-id="streamId"
          :transfer-payment-id="transferPaymentId || undefined"
          :agency-id="agencyId || undefined"
          :stream-enabled="item.streamEnabled"
          :host-layout="true" />

        <div v-else class="px-6 pt-6">
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-construction"
            :title="t('extensions.config_page_unavailable')"
            :description="t('extensions.config_page_unavailable_description')" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
