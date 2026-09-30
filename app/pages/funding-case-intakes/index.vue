<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/funding-case-intakes', fr: '/dossiers-de-financement' } } })
const { t } = useI18n()
const { canAny } = useCan()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('funding-case-intakes')
const canCreate = computed(() => canAny('funding_case', 'create'))
</script>

<template>
  <UDashboardPanel id="funding-case-intakes">
    <template #header>
      <UDashboardNavbar :title="t('funding_case_intake.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton color="neutral" variant="ghost" :icon="isHeroCollapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(isHeroCollapsed ? 'common.expand' : 'common.collapse')" @click="isHeroCollapsed = !isHeroCollapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-inbox" :title="t('funding_case_intake.title')" :description="t('funding_case_intake.description')" />
      <FundingCaseIntakeApplicationsTable :can-create="canCreate" />
    </template>
  </UDashboardPanel>
</template>
