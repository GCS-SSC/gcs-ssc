<script setup lang="ts">
import { computed } from 'vue'
import type { StatusDefinition } from '~~/shared/types/status'
import { useStatusCatalog } from '~/composables/useStatusCatalog'

const {
  agencyId,
  includeDeleted = false,
  draftOnly = false,
  multiple = false,
  disabled = false,
  allowEmpty = false,
  emptyLabel
} = defineProps<{
  agencyId: string
  includeDeleted?: boolean
  draftOnly?: boolean
  multiple?: boolean
  disabled?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
}>()
const model = defineModel<string | string[] | null | undefined>({ default: undefined })
const { locale, t } = useI18n()
const catalog = useStatusCatalog()
void catalog.load()

const selectedIds = computed(() => Array.isArray(model.value)
  ? model.value
  : typeof model.value === 'string' ? [model.value] : [])
const availableDefinitions = computed(() => {
  const definitions = catalog.getForAgency(agencyId, includeDeleted)
    .filter(definition => !draftOnly || definition.isDraft)
  const existingIds = new Set(definitions.map(definition => definition.id))
  const selectedDefinitions = selectedIds.value
    .map(id => catalog.getById(id))
    .filter((definition): definition is StatusDefinition => Boolean(
      definition
      && definition.agencyId === agencyId
      && (!draftOnly || definition.isDraft)
      && !existingIds.has(definition.id)
    ))
  return [...definitions, ...selectedDefinitions]
})
const loading = computed(() => catalog.state.value.status === 'pending')
const items = computed(() => [
  ...(allowEmpty && !multiple ? [{ label: emptyLabel ?? '', value: null }] : []),
  ...availableDefinitions.value.map((status: StatusDefinition) => ({
    label: locale.value === 'fr' ? status.nameFr : status.nameEn,
    value: status.id,
    icon: status.icon,
    disabled: status.deleted
  })),
  ...selectedIds.value.filter(id => !availableDefinitions.value.some(status => status.id === id)).map(id => ({
    label: t(loading.value ? 'common.loading' : 'common.unavailable'),
    value: id,
    disabled: true
  }))
])
</script>

<template>
  <USelectMenu v-model="model" :items="items" :loading="loading" :multiple="multiple" :disabled="disabled" value-key="value" searchable />
</template>
