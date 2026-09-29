<script setup lang="ts">
import { getGcsExtensionComponent } from '#gcs-extensions/registry'
import type { ExtensionAgencyRegistryItem, ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { appRouteLocations } from '~/utils/route-locations'

definePageMeta({ key: route => route.path, i18n: { paths: {
  en: '/extension/[id]/agencies/[agencyId]/forms/[formId]',
  fr: '/extension/[id]/agences/[agencyId]/formulaires/[formId]'
} } })

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('extension-agency-form-detail')
const extensionKey = computed(() => String(route.params.id))
const agencyId = computed(() => String(route.params.agencyId))
const formId = computed(() => String(route.params.formId))
type LoadStatus = 'pending' | 'success' | 'error'
const list: Ref<{ items: ExtensionAgencyWorkspaceListItem[] } | null> = ref(null)
const registry: Ref<{ items: ExtensionAgencyRegistryItem[] } | null> = ref(null)
const status: Ref<LoadStatus> = ref('pending')
let requestSequence = 0
/** Loads the accessible Agency workspace and extension registration. */
const retry = async () => {
  const sequence = ++requestSequence
  status.value = 'pending'
  const responses = await Promise.allSettled([
    fetch(getClientRequestUrl('/api/extensions/workspaces')),
    fetch(getClientRequestUrl(`/api/extensions/agency/${agencyId.value}`))
  ])
  if (sequence !== requestSequence) return
  try {
    const [workspaces, agencyRegistry] = responses
    if (workspaces?.status !== 'fulfilled' || !workspaces.value.ok
      || agencyRegistry?.status !== 'fulfilled' || !agencyRegistry.value.ok) throw new Error('Unavailable')
    const [nextList, nextRegistry] = await Promise.all([
      workspaces.value.json() as Promise<{ items: ExtensionAgencyWorkspaceListItem[] }>,
      agencyRegistry.value.json() as Promise<{ items: ExtensionAgencyRegistryItem[] }>
    ])
    if (sequence !== requestSequence) return
    list.value = nextList
    registry.value = nextRegistry
    status.value = 'success'
  } catch {
    if (sequence !== requestSequence) return
    list.value = null
    registry.value = null
    status.value = 'error'
  }
}
watch([agencyId, extensionKey], () => {
  void retry()
}, { immediate: true })
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
const savedForm = (id: string) => {
  if (formId.value !== 'new') return
  void navigateTo(localePath(appRouteLocations.extensionAgencyWorkspaceForm(extensionKey.value, agencyId.value, id)), { replace: true })
}
</script>

<template>
  <UDashboardPanel id="extension-agency-form-detail">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb
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
      <div v-else-if="workspace && extension && extensionComponent" class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed" :icon="workspace.icon ?? 'i-lucide-panels-top-left'"
          :title="agencyName" :description="formsLabel" />
        <component
          :is="extensionComponent" :key="`${extensionKey}:${agencyId}`"
          :agency-id="agencyId" :extension-key="extensionKey" section="forms"
          :detail-form-id="formId === 'new' ? '' : formId"
          :enabled="true" :read-only="!extension.canConfigure" :config="extension.config"
          @saved-form="savedForm" @form-collection-label="formCollectionLabel = $event" />
      </div>
      <UAlert v-else color="error" :title="t('common.not_available')" />
    </template>
  </UDashboardPanel>
</template>
