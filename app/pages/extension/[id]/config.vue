<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import { computed, onScopeDispose, watch, type Ref } from 'vue'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { AppFetchResponseError, throwFetchResponseError } from '~/utils/fetch-error'
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
const extensionKey = computed(() => String(route.params.id))
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
    return extensionKey.value
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
  if (item.value?.extension.configurationAccess === 'manager' && !item.value.canConfigure) return null
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

let requestSequence = 0
const configurationIdentity = computed(() => JSON.stringify([
  extensionKey.value, streamId.value, transferPaymentId.value, agencyId.value
]))
const refresh = async () => {
  const sequence = ++requestSequence
  const requestedExtension = extensionKey.value
  const requestedStream = streamId.value
  const requestedProfile = transferPaymentId.value
  item.value = null
  profile.value = null
  stream.value = null
  draftConfig.value = {}
  loadError.value = null
  if (!requestedStream) {
    isLoading.value = false
    loadError.value = new Error(t('extensions.config_missing_stream'))
    return
  }

  try {
    isLoading.value = true
    loadError.value = null
    const profileJson = requestedProfile
      ? fetchOptionalJson(fetch(getClientRequestUrl(`/api/transfer-payments/${requestedProfile}`)))
      : Promise.resolve(null)
    const streamJson = requestedProfile
      ? fetchOptionalJson(fetch(getClientRequestUrl(`/api/transfer-payments/${requestedProfile}/streams/${requestedStream}`)))
      : Promise.resolve(null)
    const extensionResponse = await fetch(getClientRequestUrl(`/api/extensions/streams/${requestedStream}`))

    if (!extensionResponse.ok) await throwFetchResponseError(extensionResponse)

    const [payload, loadedProfile, loadedStream] = await Promise.all([
      extensionResponse.json() as Promise<ExtensionStreamRegistryResponse>, profileJson, streamJson
    ])
    if (sequence !== requestSequence) return
    item.value = payload.items.find(row => row.extension.key === requestedExtension) ?? null
    profile.value = loadedProfile as TransferPaymentProfileItem | null
    stream.value = loadedStream as TransferPaymentStreamItem | null

    if (!item.value) {
      throw new Error(t('apiErrors.extensions.not_found'))
    }

    resetDraft(item.value.config)
  } catch (error: unknown) {
    if (sequence !== requestSequence) return
    loadError.value = error
    const responseData = error instanceof AppFetchResponseError && error.data && typeof error.data === 'object'
      ? error.data as Record<string, unknown>
      : null
    const apiError = responseData?.data && typeof responseData.data === 'object'
      ? responseData.data as Record<string, unknown>
      : responseData
    const message = typeof apiError?.code === 'string' && apiError.code.trim()
      && typeof apiError.message === 'string' && apiError.message.trim()
      ? apiError.message
      : t('common.unknown_error')
    showError({ data: { message } })
  } finally {
    if (sequence === requestSequence) isLoading.value = false
  }
}

watch(configurationIdentity, () => {
  void refresh()
}, { immediate: true, flush: 'sync' })
onScopeDispose(() => {
  requestSequence++
})
</script>

<template>
  <UDashboardPanel id="extension-config" class="w-full">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :aria-label="t('common.breadcrumb')" :items="breadcrumbItems" class="ml-2" />
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
          :key="configurationIdentity"
          v-model="draftConfig"
          data-field-container="Composite editor; its individual field declarations own their identities."
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
