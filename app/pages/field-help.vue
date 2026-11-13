<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/field-help', fr: '/aide-aux-champs' } } })
const { t } = useI18n()
const { getHeroCollapsed } = useDashboard()
const collapsed = getHeroCollapsed('field-help')
</script>

<template>
  <CommonDetailPage id="field-help" v-model:collapsed="collapsed" :breadcrumb-items="[{ label: t('field_tooltips.title') }]">
    <template #body>
      <CommonEntityHero :is-collapsed="collapsed" icon="i-lucide-message-circle-question-mark" :title="t('field_tooltips.title')" :description="t('field_tooltips.description')" />
      <FieldHelpManager />
    </template>
  </CommonDetailPage>
</template>
