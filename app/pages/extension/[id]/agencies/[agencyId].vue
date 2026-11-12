<script setup lang="ts">
import { computed, useId } from 'vue'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import type { ExtensionAgencyRegistryItem, ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { useUrlTabState } from '~/composables/useUrlTabState'

definePageMeta({ i18n: { paths: {
  en: '/extension/[id]/agencies/[agencyId]', fr: '/extension/[id]/agences/[agencyId]'
} } })

const route = useRoute()
const workspacePanelId = useId()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { user, permissionRevision } = useAuth()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('extension-agency-workspace')
const extensionKey = computed(() => String(route.params.id))
const agencyId = computed(() => String(route.params.agencyId))
const workspaceRequest = useResourceRequest<{ items: ExtensionAgencyWorkspaceListItem[] }>({
  identity: () => JSON.stringify([extensionKey.value, agencyId.value, user.value?.id, permissionRevision.value]),
  refreshData: 'clear',
  failureData: 'clear',
  /**
   * Loads the authorized current workspace.
   * @param signal - Owning request cancellation.
   * @returns Current workspace evidence.
   */
  load: async signal => {
    const response = await fetch(getClientRequestUrl('/api/extensions/workspaces'), { signal })
    if (!response.ok) throw new Error('Workspace list request failed')
    return await response.json() as { items: ExtensionAgencyWorkspaceListItem[] }
  }
})
const registryRequest = useResourceRequest<{ items: ExtensionAgencyRegistryItem[] }>({
  identity: () => JSON.stringify([extensionKey.value, agencyId.value, user.value?.id, permissionRevision.value]),
  refreshData: 'clear',
  failureData: 'clear',
  /**
   * Loads the authorized current workspace.
   * @param signal - Owning request cancellation.
   * @returns Current workspace evidence.
   */
  load: async signal => {
    const response = await fetch(getClientRequestUrl(`/api/extensions/agency/${agencyId.value}`), { signal })
    if (!response.ok) throw new Error('Agency extension registry request failed')
    return await response.json() as { items: ExtensionAgencyRegistryItem[] }
  }
})
const { data: list, status: listStatus } = workspaceRequest
const { data: registry, status: registryStatus } = registryRequest
const retry = async () => {
  await Promise.all([workspaceRequest.refresh(), registryRequest.refresh()])
}
const workspace = computed(() => list.value?.items.find(item => item.key === extensionKey.value
  && item.agencies.some(agency => agency.id === agencyId.value)))
const agency = computed(() => workspace.value?.agencies.find(item => item.id === agencyId.value))
const extension = computed(() => registry.value?.items.find(item => item.extension.key === extensionKey.value && item.enabled))
const extensionComponent = computed(() => {
  const componentName = extension.value?.extension.admin.agency?.componentName
  return componentName ? getGcsExtensionComponent(componentName) : null
})
const title = computed(() => workspace.value
  ? locale.value === 'fr' ? workspace.value.label.fr : workspace.value.label.en
  : t('common.not_available'))
const agencyName = computed(() => agency.value
  ? locale.value === 'fr' ? agency.value.nameFr : agency.value.nameEn
  : agencyId.value)
const tabs = computed(() => extension.value?.extension.admin.agencyWorkspace?.tabs.map(tab => ({
  key: tab.id, value: tab.id,
  label: locale.value === 'fr' ? tab.label.fr : tab.label.en,
  icon: tab.icon
})) ?? [])
const openForm = (formId: string) => navigateTo(localePath(appRouteLocations.extensionAgencyWorkspaceForm(
  extensionKey.value, agencyId.value, formId
)))
const { selectedTab } = useUrlTabState({
  tabs,
  defaultTab: 'connection',
  enabled: computed(() => listStatus.value === 'success' && registryStatus.value === 'success' && !('formId' in route.params && route.params.formId))
})
</script>

<template>
  <NuxtPage v-if="'formId' in route.params && route.params.formId" />
  <UDashboardPanel v-else id="extension-agency-workspace">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb
            :aria-label="t('common.breadcrumb')"
            :items="[
              { label: title, to: localePath(appRouteLocations.extensionAgencyWorkspaceList(extensionKey)) },
              { label: agencyName }
            ]" class="ml-2" />
        </template>
        <template #right>
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex flex-1 flex-col">
        <div v-if="listStatus === 'pending' || registryStatus === 'pending'" role="status" class="p-6">
          {{ t('common.loading_records') }}
        </div>
        <UAlert
          v-else-if="listStatus === 'error' || registryStatus === 'error'" color="error"
          :title="t('common.resource_table_load_failed')">
          <template #actions>
            <UButton :label="t('common.retry')" @click="retry" />
          </template>
        </UAlert>
        <template v-else-if="workspace && extension && extensionComponent">
          <CommonEntityHero
            :is-collapsed="isHeroCollapsed" :icon="workspace.icon ?? 'i-lucide-panels-top-left'"
            :title="agencyName" :description="title" />
          <CommonEntityEditorWorkspace content-test-id="extension-agency-workspace-content">
            <template #sidebar>
              <CommonTranslatedTabs
                v-model="selectedTab"
                ordering="localized"
                data-field-container="Page navigation state, not a business input field." :items="tabs" :external-panel-id="workspacePanelId" orientation="vertical"
                :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </template>
            <component
              :is="extensionComponent" :id="workspacePanelId" :key="`${extensionKey}:${agencyId}:${selectedTab}`"
              role="tabpanel" :aria-label="tabs.find(tab => tab.value === selectedTab)?.label"
              :agency-id="agencyId" :extension-key="extensionKey" :section="selectedTab"
              :enabled="true" :read-only="!extension.canConfigure" :config="extension.config"
              @open-form="openForm" />
          </CommonEntityEditorWorkspace>
        </template>
        <UAlert v-else color="error" :title="t('common.not_available')" />
      </div>
    </template>
  </UDashboardPanel>
</template>
