<script setup lang="ts">
const { kind, showLabel = true } = defineProps<{ kind: 'events' | 'access'; showLabel?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
const { data, error, refresh } = useFetch<{ events: string[]; access: string[] }, Error, string>('/api/admin/audit/tables' as string)
const items = computed(() => data.value?.[kind].map(value => ({ value, label: value })) ?? [])
watch([() => kind, data], () => {
  if (data.value && model.value && !items.value.some(item => item.value === model.value)) model.value = ''
})
</script>

<template>
  <UFormField :label="showLabel ? t('audit.table') : undefined">
    <CommonBilingualSelectMenu
      :model-value="model || 'all'" :items="items" value-key="value" label-key="label"
      :aria-label="t('audit.table')"
      :disabled="Boolean(error)" :prepend-options="[{ label: t(showLabel ? 'common.all' : 'audit.allTables'), value: 'all' }]"
      @update:model-value="model = !$event || $event === 'all' ? '' : $event" />
    <div v-if="error" role="alert">
      {{ t('common.lookup_load_failed') }}
      <UButton :label="t('audit.retry')" @click="refresh()" />
    </div>
  </UFormField>
</template>
