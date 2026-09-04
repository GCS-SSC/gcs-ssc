<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc */
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useExtensionConfigurationState } from '~/composables/useExtensionConfigurationState'
import type { ExtensionStreamRegistryItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

type ExtensionStreamTableRow = ExtensionStreamRegistryItem & Record<string, unknown>

const { streamId, transferPaymentId, agencyId, canUpdateChild = false } = defineProps<{
  streamId: string
  transferPaymentId?: string
  agencyId?: string | null
  canUpdateChild?: boolean
}>()

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { showError } = useApiErrorToast()
const {
  isModalOpen,
  isDiscardConfirmOpen,
  selectedItem,
  draftConfig,
  fallbackConfigText,
  fallbackConfigError,
  isSavingConfiguration,
  isRowBusy,
  setRowBusy,
  openConfigure,
  resetConfigureState,
  closeConfigure,
  cancelDiscardChanges,
  discardChanges,
  updateFallbackConfig,
  postJson
} = useExtensionConfigurationState<ExtensionStreamTableRow>()

const { search, pagination, items, totalRecords, refresh, status } = useResourceTable<ExtensionStreamTableRow>({
  fetchUrl: computed(() => `/api/extensions/streams/${streamId}`)
})
const isLoading = computed(() => status.value === 'pending')

watch(() => streamId, resetConfigureState, { flush: 'sync' })

const columns: TableColumnInput<ExtensionStreamTableRow>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const extensionName = (item: ExtensionStreamTableRow) => {
  const extension = item.extension
  if (!extension) {
    return t('common.none')
  }

  return locale.value === 'fr' ? extension.name.fr : extension.name.en
}

const extensionDescription = (item: ExtensionStreamTableRow) => {
  const extension = item.extension
  if (!extension) {
    return ''
  }

  return locale.value === 'fr' ? extension.description?.fr : extension.description?.en
}

const selectedConfigComponent = computed(() => {
  const componentName = selectedItem.value?.extension?.admin.streamConfig?.componentName
  return componentName ? getGcsExtensionComponent(componentName) : null
})

const openConfiguration = async (item: ExtensionStreamTableRow) => {
  const extension = item.extension
  if (extension?.admin.streamConfigPage?.componentName) {
    await navigateTo(localePath(appRouteLocations.extensionStreamConfig(extension.key, {
      streamId,
      ...(transferPaymentId ? { transferPaymentId } : {}),
      ...(agencyId ? { agencyId } : {})
    })))
    return
  }

  openConfigure(item)
}

const saveConfiguration = async (item: ExtensionStreamTableRow, enabled = item.streamEnabled) => {
  const isSelectedItem = item === selectedItem.value
  const extensionKey = item.extension?.key

  if (!extensionKey) {
    return
  }

  if (isRowBusy(item)) {
    return
  }

  try {
    setRowBusy(extensionKey, true)
    if (isSelectedItem) {
      isSavingConfiguration.value = true
    }

    await postJson(`/api/extensions/streams/${streamId}`, 'PATCH', {
      extensionKey,
      enabled,
      config: isSelectedItem ? draftConfig.value : item.config
    })

    if (isSelectedItem) {
      resetConfigureState()
    }

    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
    return
  } finally {
    setRowBusy(extensionKey, false)
    if (isSelectedItem) {
      isSavingConfiguration.value = false
    }
  }

  try {
    await refresh()
  } catch (error: unknown) {
    showError(error)
  }
}
</script>

<template>
  <div class="space-y-6">
    <CommonResourceLayoutCard
      v-model:search="search"
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :total-records="totalRecords"
      :loading="isLoading"
      :request-status="status"
      :show-button="false"
      :show-column-toggle="false"
      @retry="refresh">
      <template #name-cell="{ row }">
        <div class="min-w-0 py-1">
          <div class="font-semibold text-zinc-900 dark:text-white">
            {{ extensionName(row.original) }}
          </div>
          <div class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {{ extensionDescription(row.original) || t('extensions.no_description') }}
          </div>
        </div>
      </template>

      <template #status-cell="{ row }">
        <CommonStatusBadge
          :variant="row.original.streamEnabled ? 'enabled' : 'disabled'"
          :label="row.original.streamEnabled ? t('extensions.enabled') : t('extensions.disabled')" />
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <USwitch
            :model-value="row.original.streamEnabled"
            :disabled="!canUpdateChild || isRowBusy(row.original)"
            :aria-label="t('extensions.enable_extension')"
            @update:model-value="value => saveConfiguration(row.original, value)" />
          <UTooltip :text="t('extensions.configure')">
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :disabled="!canUpdateChild || isRowBusy(row.original)"
              :aria-label="t('extensions.configure')"
              :title="t('extensions.configure')"
              @click="openConfiguration(row.original)" />
          </UTooltip>
        </div>
      </template>
    </CommonResourceLayoutCard>

    <UModal
      v-model:open="isModalOpen"
      :title="selectedItem ? extensionName(selectedItem) : t('extensions.configure')"
      :description="selectedItem ? (extensionDescription(selectedItem) || t('extensions.no_description')) : undefined"
      fullscreen
      :dismissible="false"
      :ui="{ content: 'rounded-none shadow-none ring-0' }"
      @update:open="value => value ? undefined : closeConfigure()">
      <template #body>
        <div v-if="selectedItem" class="flex h-full flex-col">
          <div class="flex-1 overflow-y-auto p-6 lg:p-8">
            <div class="mx-auto w-full max-w-6xl space-y-4 pb-12">
              <component
                :is="selectedConfigComponent"
                v-if="selectedConfigComponent"
                v-model="draftConfig"
                :extension="selectedItem.extension"
                :stream-id="streamId"
                :transfer-payment-id="transferPaymentId"
                :agency-id="agencyId ?? undefined" />
              <CommonTextarea
                v-else
                :model-value="fallbackConfigText"
                :rows="18"
                class="w-full"
                @update:model-value="updateFallbackConfig" />
              <p v-if="fallbackConfigError" class="text-sm text-error">
                {{ fallbackConfigError }}
              </p>
            </div>
          </div>

          <div class="border-default flex items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
            <UButton
              color="neutral"
              variant="ghost"
              class="cursor-default"
              :label="t('common.cancel')"
              :disabled="isSavingConfiguration"
              @click="closeConfigure" />
            <CommonSaveButton
              v-if="selectedItem"
              :label="t('common.save')"
              :loading="isSavingConfiguration"
              :disabled="isSavingConfiguration || !!fallbackConfigError"
              @click="saveConfiguration(selectedItem)" />
          </div>

          <UModal
            v-model:open="isDiscardConfirmOpen"
            :title="t('extensions.discard_changes_title')"
            :description="t('extensions.discard_changes_description')"
            :dismissible="false"
            :portal="false">
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton
                  :label="t('common.cancel')"
                  color="neutral"
                  variant="ghost"
                  class="cursor-default"
                  @click="cancelDiscardChanges" />
                <UButton
                  :label="t('extensions.discard_changes_confirm')"
                  color="primary"
                  class="cursor-default"
                  @click="discardChanges" />
              </div>
            </template>
          </UModal>
        </div>
      </template>
    </UModal>
  </div>
</template>
