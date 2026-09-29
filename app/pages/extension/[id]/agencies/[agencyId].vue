<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import type { ExtensionAgencyRegistryItem, ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'

definePageMeta({ i18n: { paths: {
  en: '/extension/[id]/agencies/[agencyId]', fr: '/extension/[id]/agences/[agencyId]'
} } })

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('extension-agency-workspace')
const extensionKey = computed(() => String(route.params.id))
const agencyId = computed(() => String(route.params.agencyId))
type LoadStatus = 'pending' | 'success' | 'error'
const list: Ref<{ items: ExtensionAgencyWorkspaceListItem[] } | null> = ref(null)
const registry: Ref<{ items: ExtensionAgencyRegistryItem[] } | null> = ref(null)
const listStatus: Ref<LoadStatus> = ref('pending')
const registryStatus: Ref<LoadStatus> = ref('pending')
let requestSequence = 0
const requestedTab = computed(() => typeof route.query.section === 'string' ? route.query.section : '')
const selectedTab = ref(requestedTab.value || 'connection')
/** Reloads the accessible workspace and Agency registry for the current route. */
const retry = async () => {
  const sequence = ++requestSequence
  list.value = null
  registry.value = null
  listStatus.value = 'pending'
  registryStatus.value = 'pending'
  const requests = await Promise.allSettled([
    fetch(getClientRequestUrl('/api/extensions/workspaces')),
    fetch(getClientRequestUrl(`/api/extensions/agency/${agencyId.value}`))
  ])
  if (sequence !== requestSequence) return
  const [listResponse, registryResponse] = requests
  const parsed = await Promise.allSettled([
    listResponse?.status === 'fulfilled' && listResponse.value.ok
      ? listResponse.value.json() as Promise<{ items: ExtensionAgencyWorkspaceListItem[] }>
      : Promise.reject(new Error('Workspace list request failed')),
    registryResponse?.status === 'fulfilled' && registryResponse.value.ok
      ? registryResponse.value.json() as Promise<{ items: ExtensionAgencyRegistryItem[] }>
      : Promise.reject(new Error('Agency extension registry request failed'))
  ])
  if (sequence !== requestSequence) return
  if (parsed[0]?.status === 'fulfilled') {
    list.value = parsed[0].value
    listStatus.value = 'success'
  } else {
    list.value = null
    listStatus.value = 'error'
  }
  if (parsed[1]?.status === 'fulfilled') {
    registry.value = parsed[1].value
    registryStatus.value = 'success'
  } else {
    registry.value = null
    registryStatus.value = 'error'
  }
}
watch([agencyId, extensionKey], () => {
  selectedTab.value = requestedTab.value || 'connection'
  void retry()
}, { immediate: true })
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
watch([requestedTab, tabs], ([requested, available]) => {
  if (!available.length) return
  const next = available.find(tab => tab.value === requested)?.value
    ?? available.find(tab => tab.value === 'connection')?.value
    ?? available[0]!.value
  if (selectedTab.value !== next) selectedTab.value = next
}, { immediate: true })
watch(selectedTab, (value) => {
  if (route.params.formId || !tabs.value.some(tab => tab.value === value) || requestedTab.value === value) return
  void navigateTo({ path: route.path, query: { ...route.query, section: value }, hash: route.hash }, { replace: true })
})
</script>

<template>
  <NuxtPage v-if="route.params.formId" />
  <UDashboardPanel v-else id="extension-agency-workspace">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb
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
              <CommonRouteTabs
                v-model="selectedTab" :items="tabs" orientation="vertical"
                :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
            </template>
            <component
              :is="extensionComponent" :key="`${extensionKey}:${agencyId}:${selectedTab}`"
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
