<script setup lang="ts">
const { kind, showLabel = true } = defineProps<{ kind: 'events' | 'access'; showLabel?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const { data, error, refresh } = useFetch<{ events: string[]; access: string[] }, Error, string>('/api/admin/audit/tables' as string)
const labelKeys = new Map([
  ['public.Funding_Case_Agreement_Submission', 'audit.tableLabels.agreementSubmission'],
  ['public.Funding_Case_Agreement_Submission_Event', 'audit.tableLabels.agreementSubmissionEvent']
])
const items = computed(() => data.value?.[kind].map(value => {
  const labelKey = labelKeys.get(value)
  return { value, label: labelKey ? t(labelKey) : value }
}) ?? [])
watch([() => kind, data, model], () => {
  if (data.value && model.value && !items.value.some(item => item.value === model.value)) model.value = ''
}, { immediate: true })
</script>

<template>
  <UFormField :label="showLabel ? t('audit.table') : undefined" data-ui-target="admin.audit-table-filter.audit.table" data-field-scope="admin.audit-table-filter">
    <CommonBilingualSelectMenu
      :model-value="model || 'all'" :items="items" value-key="value" label-key="label"
      :filter-fields="['label', 'value']"
      :aria-label="t('audit.table')"
      :disabled="Boolean(error)" :prepend-options="[{ label: t(showLabel ? 'common.all' : 'audit.allTables'), value: 'all' }]"
      @update:model-value="model = !$event || $event === 'all' ? '' : $event" />
    <CommonErrorNotice v-if="error" :title="t('common.lookup_load_failed')">
      <template #actions>
        <UButton :label="t('audit.retry')" @click="refresh()" />
      </template>
    </CommonErrorNotice>
  </UFormField>
</template>
