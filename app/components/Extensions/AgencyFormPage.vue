<script setup lang="ts">
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import type { ExtensionAgencyRegistryItem, ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { appRouteLocations } from '~/utils/route-locations'

const { flowOnly = false } = defineProps<{ flowOnly?: boolean }>()

const route = useRoute<'extension-id-agencies-agencyId-forms-formId___en' | 'extension-id-agencies-agencyId-forms-formId___fr' | 'extension-id-agencies-agencyId-forms-formId-flow___en' | 'extension-id-agencies-agencyId-forms-formId-flow___fr'>()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { user, permissionRevision } = useAuth()
const extensionKey = computed(() => String(route.params.id))
const agencyId = computed(() => String(route.params.agencyId))
const formId = computed(() => String(route.params.formId))
const editorView = computed(() => route.query.view === 'test' || route.query.view === 'publish' ? route.query.view : 'edit')
const { data, status, refresh: retry } = useResourceRequest({
  identity: () => JSON.stringify([extensionKey.value, agencyId.value, user.value?.id, permissionRevision.value]),
  failureData: 'clear',
  /**
   * Loads the authorized current workspace.
   * @param signal - Owning request cancellation.
   * @returns Current workspace evidence.
   */
  load: async signal => {
    const [workspaces, agencyRegistry] = await Promise.all([
      fetch(getClientRequestUrl('/api/extensions/workspaces'), { signal }),
      fetch(getClientRequestUrl(`/api/extensions/agency/${agencyId.value}`), { signal })
    ])
    if (!workspaces.ok || !agencyRegistry.ok) throw new Error('Unavailable')
    const [list, registry] = await Promise.all([
      workspaces.json() as Promise<{ items: ExtensionAgencyWorkspaceListItem[] }>,
      agencyRegistry.json() as Promise<{ items: ExtensionAgencyRegistryItem[] }>
    ])
    return { list, registry }
  }
})
const list = computed(() => data.value?.list)
const registry = computed(() => data.value?.registry)
const workspace = computed(() => list.value?.items.find(item => item.key === extensionKey.value
  && item.agencies.some(agency => agency.id === agencyId.value)))
const agency = computed(() => workspace.value?.agencies.find(item => item.id === agencyId.value))
const extension = computed(() => registry.value?.items.find(item => item.extension.key === extensionKey.value && item.enabled
  && item.extension.admin.agencyWorkspace?.tabs.some(tab => tab.id === 'forms')))
const extensionComponent = computed(() => {
  const name = extension.value?.extension.admin.agency?.componentName
  return name ? getGcsExtensionComponent(name) : null
})
const agencyName = computed(() => agency.value
  ? locale.value === 'fr' ? agency.value.nameFr : agency.value.nameEn
  : agencyId.value)
const formsLabel = computed(() => {
  const tab = extension.value?.extension.admin.agencyWorkspace?.tabs.find(item => item.id === 'forms')
  return tab ? locale.value === 'fr' ? tab.label.fr : tab.label.en : t('common.not_available')
})
const formCollectionLabel = ref('')
const formsLocation = computed(() => localePath({
  ...appRouteLocations.extensionAgencyWorkspace(extensionKey.value, agencyId.value),
  query: { section: 'forms' }
}))
watch(formId, id => {
  if (id === 'new') void navigateTo(formsLocation.value, { replace: true })
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="extension-agency-form-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb
            :aria-label="t('common.breadcrumb')"
            :items="[
              { label: agencyName, to: localePath(appRouteLocations.extensionAgencyWorkspaceList(extensionKey)) },
              { label: formCollectionLabel || formsLabel, to: formsLocation }
            ]" class="ml-2" />
        </template>
        <template #right>
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div v-if="status === 'pending'" role="status" class="p-6">
        {{ t('common.loading_records') }}
      </div>
      <UAlert v-else-if="status === 'error'" color="error" :title="t('common.resource_table_load_failed')">
        <template #actions>
          <UButton :label="t('common.retry')" @click="retry" />
        </template>
      </UAlert>
      <div v-else-if="formId === 'new'" />
      <div v-else-if="workspace && extension && extensionComponent" class="flex flex-1 flex-col">
        <component
          :is="extensionComponent" :key="`${extensionKey}:${agencyId}`"
          :agency-id="agencyId" :extension-key="extensionKey" section="forms"
          :detail-form-id="formId" :form-flow-only="flowOnly" :form-editor-view="editorView"
          :enabled="true" :read-only="!extension.canConfigure" :config="extension.config"
          @form-flow="navigateTo(localePath($event === 'flow' ? appRouteLocations.extensionAgencyWorkspaceFormFlow(extensionKey, agencyId, formId) : { ...appRouteLocations.extensionAgencyWorkspaceForm(extensionKey, agencyId, formId), query: $event === 'edit' ? {} : { view: $event } }))"
          @close-form="navigateTo(formsLocation)" @form-collection-label="formCollectionLabel = $event" />
      </div>
      <UAlert v-else color="error" :title="t('common.not_available')" />
    </template>
  </UDashboardPanel>
</template>
