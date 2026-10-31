<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/funding-case-intakes', fr: '/dossiers-de-financement' } } })
const { t } = useI18n()
const { canAny } = useCan()
const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('funding-case-intakes')
const canCreate = computed(() => canAny('funding_case', 'create'))
</script>

<template>
  <CommonDetailPage id="funding-case-intakes" v-model:collapsed="isHeroCollapsed" data-help-view="intakes.list" :title="t('funding_case_intake.title')">
    <template #body>
      <CommonEntityHero :is-collapsed="isHeroCollapsed" icon="i-lucide-inbox" :title="t('funding_case_intake.title')" :description="t('funding_case_intake.description')" />
      <section data-help-target="intakes.list.records" data-help-kind="section" class="flex w-full min-w-0 flex-col">
        <FundingCaseIntakeApplicationsTable :can-create="canCreate" />
      </section>
    </template>
  </CommonDetailPage>
</template>
