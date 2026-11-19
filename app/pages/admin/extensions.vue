<script setup lang="ts">
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { ExtensionSystemRegistryItem } from '~~/shared/types/schemas/extensions'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'

definePageMeta({
  middleware: 'admin-system',
  i18n: { paths: { en: '/admin/extensions', fr: '/admin/extensions' } }
})

const { t, locale } = useI18n()
const { user, permissionRevision } = useAuth()
const { can, permissionsReady } = useCan()
const { showError } = useApiErrorToast()
const toast = useLocalizedToast()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('admin-extensions')
const canRead = computed(() => permissionsReady.value && can('system', 'read', { type: 'global' }))
const canUpdate = computed(() => canRead.value && can('system', 'update', { type: 'global' }))
const canReadWorkspace = computed(() => canRead.value && can('system', 'delete', { type: 'global' }))
const actionContext = useActionContext({ identity: [], authority: canUpdate })
const systemExtensionRevision = useState('system-extension-revision', () => 0)
const pendingKeys = useState<string[]>('system-extension-pending', () => [])
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const { data, status, refresh } = useResourceRequest<{ items: ExtensionSystemRegistryItem[] }>({
  identity: () => JSON.stringify([user.value?.id, permissionRevision.value]),
  enabled: canRead,
  failureData: 'clear',
  /**
   * Reads the system extension catalog for the current administrator.
   * @param signal - Cancels a superseded catalog request.
   * @returns The current catalog and authorized workspaces.
   */
  load: async signal => {
    const response = await fetch(getClientRequestUrl('/api/extensions/system'), { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json() as { items: ExtensionSystemRegistryItem[] }
  }
})
watch(systemExtensionRevision, () => void refresh())

const items = computed(() => data.value?.items ?? [])
const refreshing = computed(() => status.value === 'pending' && data.value !== null)
const pageItems = computed(() => {
  const { pageIndex, pageSize } = pagination.value
  return items.value.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
})
const columns = computed<TableColumnInput<ExtensionSystemRegistryItem>[]>(() => {
  const result: TableColumnInput<ExtensionSystemRegistryItem>[] = [
    { id: 'name', headerKey: 'common.name' },
    { id: 'status', headerKey: 'common.status' }
  ]
  if (canUpdate.value) result.push({ id: 'actions', headerKey: 'common.actions' })
  return result
})
const workspaces = computed(() => {
  if (!canReadWorkspace.value || status.value !== 'success') return []
  return items.value.flatMap(item => {
    if (!item.enabled || !item.workspaceComponentName) return []
    const component = getGcsExtensionComponent(item.workspaceComponentName)
    return component ? [{ key: item.key, component }] : []
  })
})
const language = computed(() => locale.value === 'fr' ? 'fr' : 'en')

/**
 * Saves a single extension switch and refreshes the app-wide projections after acknowledgment.
 * @param item - The catalog row that owns the control.
 * @param enabled - The desired setting.
 */
const updateEnablement = async (item: ExtensionSystemRegistryItem, enabled: boolean) => {
  const operation = actionContext.capture()
  if (!operation?.canDispatch() || status.value !== 'success' || pendingKeys.value.includes(item.key) || enabled === item.enabled) return
  pendingKeys.value = [...pendingKeys.value, item.key]
  try {
    const response = await fetch(getClientRequestUrl(`/api/extensions/system/${encodeURIComponent(item.key)}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    if (!response.ok) await throwFetchResponseError(response)

    systemExtensionRevision.value += 1
    if (operation.isCurrent()) {
      toast.add({ title: toast.localized('common.success'), description: toast.localized('common.updated_success'), color: 'success' })
    }
  } catch (error: unknown) {
    if (operation.isCurrent()) showError(error)
  } finally {
    pendingKeys.value = pendingKeys.value.filter(key => key !== item.key)
  }
}
</script>

<template>
  <CommonDetailPage
    id="admin-extensions"
    v-model:collapsed="isHeroCollapsed"
    :title="t('extensions.tab')"
    data-field-scope="admin.extensions"
    data-field-tooltip-unavailable="System extension settings have global scope.">
    <CommonEntityHero
      :is-collapsed="isHeroCollapsed"
      icon="i-lucide-puzzle"
      :title="t('extensions.tab')"
      :description="t('extensions.system_description')" />

    <div v-if="canRead" class="min-w-0 space-y-6 p-6" :aria-busy="refreshing">
      <CommonErrorNotice
        v-if="status === 'error'"
        :title="t('extensions.system_load_failed')"
        :description="t('extensions.load_failed_description')">
        <template #actions>
          <UButton :label="t('common.retry')" @click="refresh()" />
        </template>
      </CommonErrorNotice>
      <p v-else-if="status === 'success' && !items.length" class="text-sm text-muted">
        {{ t('extensions.none_available') }}
      </p>
      <CommonResourceLayout
        v-else
        v-model:pagination="pagination"
        :columns="columns"
        :data="pageItems"
        :total-records="items.length"
        :request-status="refreshing ? undefined : status"
        :show-toolbar="false">
        <template #name-cell="{ row }">
          <div class="font-semibold">
            {{ row.original.name[language] }}
          </div>
          <p v-if="row.original.description?.[language]" class="mt-1 text-sm text-muted">
            {{ row.original.description[language] }}
          </p>
        </template>
        <template #status-cell="{ row }">
          <CommonStatusBadge
            :variant="row.original.enabled ? 'enabled' : 'disabled'"
            :label="t(row.original.enabled ? 'extensions.enabled' : 'extensions.disabled')" />
        </template>
        <template v-if="canUpdate" #actions-cell="{ row }">
          <USwitch
            :model-value="row.original.enabled"
            :aria-disabled="status !== 'success' || pendingKeys.includes(row.original.key)"
            class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            :aria-label="`${t('extensions.enable_extension')}: ${row.original.name[language]}`"
            data-ui-target="admin.extensions.enablement"
            @update:model-value="value => updateEnablement(row.original, value)" />
        </template>
      </CommonResourceLayout>

      <component
        :is="workspace.component"
        v-for="workspace in workspaces"
        :key="`${user?.id}:${permissionRevision}:${workspace.key}`"
        data-field-container="System workspaces own their controls and validation." />
    </div>
  </CommonDetailPage>
</template>
