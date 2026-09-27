<script setup lang="ts">
import { getPaginationRowModel } from '@tanstack/table-core'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { TableColumnInput } from '~/composables/useTableColumns'
import type { ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'

definePageMeta({ i18n: { paths: {
  en: '/extension/[id]/agencies', fr: '/extension/[id]/agences'
} } })

type Agency = ExtensionAgencyWorkspaceListItem['agencies'][number]
const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('extension-agency-workspace-list')
const extensionKey = computed(() => String(route.params.id))
type LoadStatus = 'pending' | 'success' | 'error'
const data: Ref<{ items: ExtensionAgencyWorkspaceListItem[] } | null> = ref(null)
const status: Ref<LoadStatus> = ref('pending')
let requestSequence = 0
/** Reloads the enabled Agencies visible through the current extension workspace. */
const refresh = async () => {
  const sequence = ++requestSequence
  status.value = 'pending'
  try {
    const response = await fetch(getClientRequestUrl('/api/extensions/workspaces'))
    if (!response.ok) throw new Error('Workspace list request failed')
    const result = await response.json() as { items: ExtensionAgencyWorkspaceListItem[] }
    if (sequence !== requestSequence) return
    data.value = result
    status.value = 'success'
  } catch {
    if (sequence !== requestSequence) return
    data.value = null
    status.value = 'error'
  }
}
watch(extensionKey, refresh, { immediate: true })
const workspace = computed(() => data.value?.items.find(item => item.key === extensionKey.value))
const title = computed(() => workspace.value
  ? locale.value === 'fr' ? workspace.value.label.fr : workspace.value.label.en
  : t('common.not_available'))
const search = ref('')
const pagination = ref({ pageIndex: 0, pageSize: 10 })
const agencies = computed(() => workspace.value?.agencies.filter(agency => {
  const term = search.value.trim().toLocaleLowerCase()
  return !term || [agency.nameEn, agency.nameFr].some(name => name.toLocaleLowerCase().includes(term))
}) ?? [])
const columns: TableColumnInput<Agency>[] = [
  { id: 'name', headerKey: 'agency.name_en' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <UDashboardPanel id="extension-agency-workspaces">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <CommonNavbarSide />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="flex flex-1 flex-col overflow-hidden">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed" :icon="workspace?.icon ?? 'i-lucide-panels-top-left'"
          :title="title" :description="t('extensions.workspace_agencies_description')"
          :stats="[{ label: t('nav.agencies'), value: workspace?.agencies.length ?? 0 }]" />
        <CommonResourceLayoutPage
          v-if="workspace" v-model:search="search" v-model:pagination="pagination"
          :data="agencies" :columns="columns" :total-records="agencies.length"
          :loading="status === 'pending'" :request-status="status"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :show-button="false" :show-column-toggle="false" @retry="refresh">
          <template #name-cell="{ row }">
            <CommonBilingualName
              :name-en="row.original.nameEn" :name-fr="row.original.nameFr"
              :to="localePath(appRouteLocations.extensionAgencyWorkspace(extensionKey, row.original.id))" />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                icon="i-lucide-arrow-right" color="neutral" variant="ghost"
                :to="localePath(appRouteLocations.extensionAgencyWorkspace(extensionKey, row.original.id))"
                :aria-label="`${t('common.view_details')}: ${locale === 'fr' ? row.original.nameFr : row.original.nameEn}`" />
            </div>
          </template>
        </CommonResourceLayoutPage>
        <UAlert v-else-if="status === 'error'" color="error" :title="t('common.resource_table_load_failed')">
          <template #actions>
            <UButton :label="t('common.retry')" @click="() => refresh()" />
          </template>
        </UAlert>
        <UAlert v-else-if="status === 'success'" color="error" :title="t('common.not_available')" />
      </div>
    </template>
  </UDashboardPanel>
</template>
