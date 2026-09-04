<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local event handlers are self-documenting */
import type { TableColumnInput } from '~/composables/useTableColumns'
import { useExtensionConfigurationState } from '~/composables/useExtensionConfigurationState'
import type { ExtensionAgencyRegistryItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'

type ExtensionAgencyTableRow = ExtensionAgencyRegistryItem & Record<string, unknown>

const { agencyId, canUpdate } = defineProps<{ agencyId: string, canCreate: boolean, canUpdate: boolean, canDelete: boolean }>()

const { t, locale } = useI18n()
const toast = useToast()
const canEdit = computed(() => canUpdate)
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
} = useExtensionConfigurationState<ExtensionAgencyTableRow>()

const { pagination, items, totalRecords, refresh, status } = useResourceTable<ExtensionAgencyTableRow>({
  fetchUrl: computed(() => `/api/extensions/agency/${agencyId}`)
})
const isLoading = computed(() => status.value === 'pending')
const hasLoadError = computed(() => status.value === 'error')

interface ExtensionMigrationResponse {
  extensionKey: string
  results: Array<{ migrationName: string, direction: string, status: string }>
}

const columns: TableColumnInput<ExtensionAgencyTableRow>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { id: 'status', headerKey: 'common.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const extensionName = (item: ExtensionAgencyRegistryItem) =>
  locale.value === 'fr' ? item.extension.name.fr : item.extension.name.en

const extensionDescription = (item: ExtensionAgencyRegistryItem) =>
  locale.value === 'fr' ? item.extension.description?.fr : item.extension.description?.en

const selectedConfigComponent = computed(() => {
  const componentName = selectedItem.value?.extension.admin.agency?.componentName
  return componentName ? getGcsExtensionComponent(componentName) : null
})

const updateEnablement = async (item: ExtensionAgencyRegistryItem, enabled: boolean) => {
  if (!canEdit.value || isRowBusy(item) || (item.storageProvider?.selected && !enabled)) {
    return
  }

  try {
    setRowBusy(item.extension.key, true)
    await postJson(`/api/extensions/agency/${agencyId}`, 'PATCH', {
      extensionKey: item.extension.key,
      enabled
    })
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    setRowBusy(item.extension.key, false)
  }
}

const saveConfiguration = async (item: ExtensionAgencyTableRow) => {
  if (!canEdit.value || isRowBusy(item) || isSavingConfiguration.value) {
    return
  }

  try {
    setRowBusy(item.extension.key, true)
    isSavingConfiguration.value = true
    await postJson(`/api/extensions/agency/${agencyId}`, 'PATCH', {
      extensionKey: item.extension.key,
      enabled: item.enabled,
      config: draftConfig.value
    })
    resetConfigureState()
    await refresh()
    toast.add({ title: t('common.success'), description: t('common.updated_success'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    setRowBusy(item.extension.key, false)
    isSavingConfiguration.value = false
  }
}

const runMigrations = async (item: ExtensionAgencyRegistryItem) => {
  if (!canEdit.value || !item.enabled || !item.hasMigrations || isRowBusy(item)) {
    return
  }

  try {
    setRowBusy(item.extension.key, true)
    const response = await postJson<ExtensionMigrationResponse>(`/api/extensions/agency/${agencyId}/migrations`, 'POST', {
      extensionKey: item.extension.key
    })
    await refresh()
    toast.add({
      title: t('common.success'),
      description: t(response.results.length > 0
        ? 'extensions.migrations_applied'
        : 'extensions.no_pending_migrations'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    setRowBusy(item.extension.key, false)
  }
}

const selectStorageProvider = async (item: ExtensionAgencyRegistryItem) => {
  if (!canEdit.value || !item.enabled || !item.extension.fileStorageProvider || isRowBusy(item)) return
  try {
    setRowBusy(item.extension.key, true)
    await postJson(`/api/extensions/agency/${agencyId}/storage-provider`, 'PATCH', {
      providerKey: item.extension.key
    })
    await refresh()
    toast.add({ title: t('common.success'), description: t('extensions.storage_provider_selected'), color: 'success' })
  } catch (error: unknown) {
    showError(error)
  } finally {
    setRowBusy(item.extension.key, false)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-zinc-900 dark:text-white">
        {{ t('extensions.agency_title') }}
      </h2>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('extensions.agency_description') }}
      </p>
    </div>

    <div v-if="isLoading" class="text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('common.loading') }}
    </div>

    <UAlert
      v-else-if="hasLoadError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('extensions.load_failed')"
      :description="t('extensions.load_failed_description')">
      <template #actions>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          icon="i-lucide-refresh-cw"
          :label="t('common.retry')"
          @click="() => refresh().catch(showError)" />
      </template>
    </UAlert>

    <div v-else-if="items.length === 0" class="text-sm text-zinc-500 dark:text-zinc-400">
      {{ t('extensions.none_available') }}
    </div>

    <CommonResourceLayoutCard
      v-else
      v-model:pagination="pagination"
      :data="items"
      :columns="columns"
      :total-records="totalRecords"
      :loading="isLoading"
      :show-button="false"
      :show-search="false"
      :show-column-toggle="false">
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
        <div class="flex flex-wrap gap-2">
          <CommonStatusBadge
            :variant="row.original.enabled ? 'enabled' : 'disabled'"
            :label="row.original.enabled ? t('extensions.enabled') : t('extensions.disabled')" />
          <UBadge v-if="row.original.storageProvider?.selected" color="primary" variant="subtle">
            {{ t('extensions.storage_provider_selected_status') }}
          </UBadge>
        </div>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center gap-2">
          <UTooltip v-if="row.original.enabled && row.original.hasMigrations && canEdit" :text="t('extensions.run_migrations')">
            <UButton
              icon="i-lucide-database-backup"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :loading="isRowBusy(row.original)"
              :disabled="isRowBusy(row.original)"
              :aria-label="`${t('extensions.run_migrations')}: ${extensionName(row.original)}`"
              :title="t('extensions.run_migrations')"
              @click="runMigrations(row.original)" />
          </UTooltip>
          <USwitch
            :model-value="row.original.enabled"
            :disabled="!canEdit || isRowBusy(row.original) || row.original.storageProvider?.selected"
            :aria-label="`${t('extensions.enable_extension')}: ${extensionName(row.original)}`"
            @update:model-value="value => updateEnablement(row.original, value)" />
          <UTooltip
            v-if="row.original.extension.fileStorageProvider && !row.original.storageProvider?.selected"
            :text="t('extensions.select_storage_provider')">
            <UButton
              icon="i-lucide-hard-drive-upload"
              color="primary"
              variant="ghost"
              size="sm"
              :disabled="!canEdit || !row.original.enabled || isRowBusy(row.original)"
              :aria-label="`${t('extensions.select_storage_provider')}: ${extensionName(row.original)}`"
              @click="selectStorageProvider(row.original)" />
          </UTooltip>
          <UTooltip v-if="row.original.extension.admin.agency" :text="t('extensions.configure')">
            <UButton
              icon="i-lucide-settings"
              color="neutral"
              variant="ghost"
              size="sm"
              class="cursor-default"
              :disabled="isRowBusy(row.original)"
              :aria-label="`${t('extensions.configure')}: ${extensionName(row.original)}`"
              :title="t('extensions.configure')"
              @click="openConfigure(row.original)" />
          </UTooltip>
        </div>
      </template>

      <template #footer-left>
        <span class="text-zinc-900 dark:text-white">
          {{ totalRecords }}
        </span>
        {{ t('common.records') }}
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
            <div class="mx-auto w-full max-w-4xl space-y-4 pb-12">
              <component
                :is="selectedConfigComponent"
                v-if="selectedConfigComponent"
                v-model="draftConfig"
                :extension="selectedItem.extension"
                :agency-id="agencyId"
                :enabled="selectedItem.enabled"
                :persisted-config="selectedItem.config"
                :disabled="!canEdit"
                :read-only="!canEdit" />
              <CommonTextarea
                v-else
                :model-value="fallbackConfigText"
                :rows="18"
                class="w-full"
                :disabled="!canEdit"
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
              v-if="canEdit"
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
