<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type {
  AdminCommonLookupResponse,
  AdminCommonLookupResponseItem,
  AdminCommonSelectOption
} from '~~/shared/types/admin-common-ui'
import { toAdminLookupOption } from '~/utils/admin-common-lookup'

defineOptions({ inheritAttrs: false })

const {
  fetchUrl,
  valueKey,
  labelEnKey,
  labelFrKey,
  showValueInLabel = true,
  deleted = false,
  query = {},
  disabled = false,
  required = false
} = defineProps<{
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  showValueInLabel?: boolean
  deleted?: boolean
  query?: Record<string, string | number | boolean>
  disabled?: boolean
  required?: boolean
}>()

const model = defineModel<string[]>({ default: () => [] })
const { t, locale } = useI18n()

const requestQuery: ComputedRef<Record<string, string | number | boolean>> = computed(() => ({
  page: 1,
  limit: 100,
  deleted,
  ...query
}))
const { data: response, status, error } = useFetch<AdminCommonLookupResponse, Error, string>(() => fetchUrl, {
  query: requestQuery,
  default: () => ({ items: [] })
})

const items: ComputedRef<AdminCommonSelectOption[]> = computed(() => {
  return (response.value?.items ?? []).map((item: AdminCommonLookupResponseItem) => toAdminLookupOption(item, {
    valueKey,
    labelEnKey,
    labelFrKey,
    locale: locale.value,
    showValueInLabel
  }))
})
const hydrationContext = computed(() => JSON.stringify({ fetchUrl, valueKey, labelEnKey, labelFrKey, deleted, query }))
const hydratedSelectedRows: Ref<Record<string, AdminCommonLookupResponseItem>> = ref({})
let hydrationGeneration = 0
watch(hydrationContext, () => {
  hydrationGeneration += 1
  hydratedSelectedRows.value = {}
}, { flush: 'sync' })
watch([model, items, hydrationContext], async () => {
  const requestGeneration = ++hydrationGeneration
  const requestedContext = hydrationContext.value
  const visibleValues = new Set(items.value.map(item => item.value))
  const modelValues = Array.isArray(model.value) ? model.value : []
  const missingValues = modelValues.filter(value => !visibleValues.has(value) && !hydratedSelectedRows.value[value])
  if (missingValues.length === 0 || typeof $fetch !== 'function') return

  const fetchLookup = $fetch as unknown as (
    url: string,
    options: { query: Record<string, string | number | boolean> }
  ) => Promise<AdminCommonLookupResponse>
  const responses = await Promise.all(missingValues.map(async value => {
    try {
      return await fetchLookup(fetchUrl, {
        query: { page: 1, limit: 1, deleted, ...query, search: value }
      })
    } catch {
      return { items: [] }
    }
  }))
  if (requestGeneration !== hydrationGeneration || requestedContext !== hydrationContext.value) return
  const hydrated = { ...hydratedSelectedRows.value }
  for (const responseItem of responses.flatMap(result => result.items)) {
    hydrated[String(responseItem[valueKey] ?? '')] = responseItem
  }
  hydratedSelectedRows.value = hydrated
}, { immediate: true })
const selectedItems: ComputedRef<AdminCommonSelectOption[]> = computed(() => {
  const selectedValues = new Set(Array.isArray(model.value) ? model.value : [])
  const hydratedItems = Object.values(hydratedSelectedRows.value).map(item => toAdminLookupOption(item, {
    valueKey,
    labelEnKey,
    labelFrKey,
    locale: locale.value,
    showValueInLabel
  }))
  const availableItems = [...items.value, ...hydratedItems]
  return availableItems.filter((item, index) =>
    selectedValues.has(item.value) && availableItems.findIndex(candidate => candidate.value === item.value) === index
  )
})
const statusMessage: ComputedRef<string> = computed(() => {
  if (status.value === 'pending') return t('common.loading')
  if (error.value) return t('common.lookup_load_failed')
  if (items.value.length === 0) return t('common.no_options')
  return t('common.selected_count', { count: model.value.length })
})

const updateModel = (value: string[]) => {
  model.value = value
}

const removeSelectedItem = (value: string) => {
  model.value = model.value.filter(selectedValue => selectedValue !== value)
}
</script>

<template>
  <div class="space-y-2">
    <USelectMenu
      :model-value="model"
      :items="items"
      value-key="value"
      label-key="label"
      multiple
      :loading="status === 'pending'"
      :disabled="disabled || Boolean(error) || (status !== 'pending' && items.length === 0)"
      :required="required"
      :search-input="{ placeholder: t('common.search') }"
      v-bind="$attrs"
      @update:model-value="updateModel" />

    <p v-if="error" class="text-sm text-error" role="alert">
      {{ t('common.lookup_load_failed') }}
    </p>
    <p v-else-if="status !== 'pending' && items.length === 0" class="text-sm text-zinc-500">
      {{ t('common.no_options') }}
    </p>

    <ul v-if="selectedItems.length > 0" class="flex flex-wrap gap-2" :aria-label="t('common.selected_items')">
      <li v-for="item in selectedItems" :key="item.value">
        <span class="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-sm dark:bg-zinc-800">
          {{ item.label }}
          <button
            type="button"
            class="cursor-default rounded-sm p-0.5 text-zinc-500 hover:text-error disabled:opacity-50"
            :disabled="disabled"
            :aria-label="t('common.remove_selected_item', { label: item.label })"
            @click="removeSelectedItem(item.value)">
            <UIcon name="i-lucide-x" aria-hidden="true" />
          </button>
        </span>
      </li>
    </ul>
    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ statusMessage }}
    </p>
  </div>
</template>
