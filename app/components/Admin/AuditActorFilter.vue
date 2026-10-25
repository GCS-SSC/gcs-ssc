<script setup lang="ts">
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
</script>

<template>
  <UFormField :label="t('audit.actor')" data-ui-target="admin.audit-actor-filter.audit.actor" data-field-scope="admin.audit-actor-filter">
    <CommonServerLookupSelect
      :model-value="model || 'all'"
      fetch-url="/api/admin/audit/actors"
      value-key="id"
      label-en-key="name"
      label-fr-key="name"
      :limit="5"
      :include-deleted-query="false"
      selected-values-query-key="selectedIds"
      :prepend-items="[{ label: t('common.all'), value: 'all' }]"
      @update:model-value="model = !$event || $event === 'all' ? '' : $event" />
  </UFormField>
</template>
