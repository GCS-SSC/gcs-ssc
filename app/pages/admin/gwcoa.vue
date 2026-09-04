<script setup lang="ts">
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { Ref } from 'vue'
import AdminCommonManagerTab from '~/components/AdminCommon/AdminCommonManagerTab.vue'
import { buildAdminCommonColumns } from '~/utils/admin-common-columns'
import { CommonGwcoaCreateSchema } from '~~/shared/types/schemas'
import type { AdminCommonField, AdminCommonResourceStatsResponse } from '~~/shared/types/admin-common-ui'

definePageMeta({
  middleware: 'admin-gwcoa',
  i18n: {
    paths: {
      en: '/admin/gwcoa',
      fr: '/admin/gwcoa'
    }
  }
})

const { t } = useI18n()
const { can } = useCan()
const canManageGwcoa = computed(() =>
  can('system', 'create', { type: 'global' })
  && can('system', 'update', { type: 'global' })
)
const fields: AdminCommonField[] = [
  { key: 'egcs_cn_number', labelKey: 'admin_common.fields.egcs_cn_number', type: 'number' },
  { key: 'egcs_cn_name_en', labelKey: 'admin_common.fields.egcs_cn_name_en', type: 'text' },
  { key: 'egcs_cn_name_fr', labelKey: 'admin_common.fields.egcs_cn_name_fr', type: 'text' }
]
const { columns, bilingualColumns } = buildAdminCommonColumns(
  ['egcs_cn_number', 'egcs_cn_name_en', 'egcs_cn_name_fr'],
  fields.map(field => field.key)
)

const statsResponse: Ref<AdminCommonResourceStatsResponse> = ref({ stats: { total: 0 } })
/**
 *
 */
const refreshStats = async () => {
  const requestUrl = getClientRequestUrl('/api/admin/gwcoa')
  requestUrl.searchParams.set('page', '1')
  requestUrl.searchParams.set('limit', '1')
  try {
    const response = await fetch(requestUrl)
    statsResponse.value = response.ok
      ? await response.json() as AdminCommonResourceStatsResponse
      : { stats: { total: 0 } }
  } catch {
    statsResponse.value = { stats: { total: 0 } }
  }
}

onMounted(refreshStats)

const stats = computed(() => ({
  total: Number(statsResponse.value?.stats?.total || 0),
  active: statsResponse.value?.stats?.active == null ? null : Number(statsResponse.value.stats.active)
}))

const gwcoaHeroStats = computed(() => [
  {
    label: t('admin_common.total'),
    value: stats.value.total
  },
  {
    label: t('admin_common.active_count'),
    value: stats.value.active,
    accent: true,
    visible: stats.value.active !== null
  }
])

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('admin-gwcoa')
</script>

<template>
  <UDashboardPanel id="admin-gwcoa">
    <template #header>
      <UDashboardNavbar :title="t('admin_common.resources.gwcoa')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')"
              @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-database"
          :title="t('admin_common.resources.gwcoa')"
          :description="t('admin_common.gwcoa_description')"
          :stats="gwcoaHeroStats" />

        <div class="p-6">
          <AdminCommonManagerTab
            :title="t('admin_common.resources.gwcoa')"
            icon="i-lucide-landmark"
            resource="gwcoa"
            :schema="CommonGwcoaCreateSchema"
            :columns="columns"
            :bilingual-columns="bilingualColumns"
            :fields="fields"
            :read-only="!canManageGwcoa"
            fetch-url="/api/admin/gwcoa"
            post-url="/api/admin/gwcoa"
            update-url-base="/api/admin/gwcoa"
            @added="refreshStats"
            @updated="refreshStats"
            @deleted="refreshStats" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
