<script setup lang="ts">
import { AUDIT_OPERATION_VALUES, ACCESS_OUTCOME_VALUES } from '~~/shared/types/audit-filter-options'

const { kind } = defineProps<{ kind: 'events' | 'access' }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const items = computed(() => (kind === 'access' ? ACCESS_OUTCOME_VALUES : AUDIT_OPERATION_VALUES)
  .map(value => ({
    value, label: t(`audit.operations.${value.replaceAll('.', '_')}`),
    category: t(value.includes('.') ? 'audit.securityEvents' : 'audit.dataChanges')
  })))
watch(() => kind, () => {
  model.value = ''
})
</script>

<template>
  <UFormField :label="t(kind === 'access' ? 'audit.outcome' : 'audit.operation')">
    <CommonBilingualSelectMenu
      :model-value="model || 'all'" :items="items" value-key="value" label-key="label"
      :category-en-key="kind === 'events' ? 'category' : undefined"
      :category-fr-key="kind === 'events' ? 'category' : undefined"
      :prepend-options="[{ label: t('common.all'), value: 'all' }]"
      @update:model-value="model = !$event || $event === 'all' ? '' : $event" />
  </UFormField>
</template>
