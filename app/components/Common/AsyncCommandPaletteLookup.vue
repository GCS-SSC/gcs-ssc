<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { buildAsyncCommandPaletteLookupItems } from '~/utils/async-command-palette-lookup'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useDebouncedRequest } from '~/composables/useDebouncedRequest'
import type { CommandPaletteGroup } from '@nuxt/ui'

type LookupItem = Record<string, unknown>

const emit = defineEmits<{
  select: [item: LookupItem]
  updateOpen: [value: boolean]
}>()

const {
  fetchUrl,
  groupLabel,
  placeholder,
  valueKey,
  labelEnKey,
  labelFrKey,
  descriptionEnKey,
  descriptionFrKey,
  query,
  icon = 'i-lucide-search',
  limit = 10
} = defineProps<{
  fetchUrl: string
  groupLabel?: string
  placeholder: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  descriptionEnKey?: string
  descriptionFrKey?: string
  query?: Record<string, string | number | boolean>
  icon?: string
  limit?: number
}>()

const { t, locale } = useI18n()
const { showError } = useApiErrorToast()

const searchTerm: Ref<string> = ref('')
const request = useDebouncedRequest<LookupItem[]>({
  initialData: [],
  failureEvidence: 'clear',
  /**
   * Fetches options for the current lookup query.
   * @param signal - Cancellation owned by the current request.
   * @returns The accepted option rows.
   */
  load: async signal => {
    const requestUrl = getClientRequestUrl(fetchUrl)
    requestUrl.searchParams.set('page', '1')
    requestUrl.searchParams.set('limit', String(limit))
    for (const [key, value] of Object.entries(query ?? {})) {
      requestUrl.searchParams.set(key, String(value))
    }
    const search = searchTerm.value.trim()
    if (search) requestUrl.searchParams.set('search', search)
    const fetchResponse = await fetch(requestUrl, { signal })
    if (!fetchResponse.ok) await throwFetchResponseError(fetchResponse)
    const response = await fetchResponse.json() as { items: LookupItem[] }
    return response.items
  }
})
const isLoading = computed(() => request.state.value.kind === 'pending' || request.state.value.kind === 'debouncing')
const items = computed(() => request.state.value.kind === 'error' ? [] : request.data.value)

watch(request.state, state => {
  if (state.kind === 'error') showError(state.error)
})
watch(() => query, () => {
  void request.execute()
}, { deep: true, immediate: true })
watch(searchTerm, () => {
  request.schedule()
})

const groups = computed<CommandPaletteGroup[]>(() => [
  {
    id: 'lookup',
    label: groupLabel,
    ignoreFilter: true,
    items: buildAsyncCommandPaletteLookupItems(items.value, {
      valueKey,
      labelEnKey,
      labelFrKey,
      descriptionEnKey,
      descriptionFrKey,
      locale: locale.value,
      icon,
      onSelect: async item => emit('select', item)
    })
  }
])
</script>

<template>
  <UCommandPalette
    v-model:search-term="searchTerm"
    :groups="groups"
    :loading="isLoading"
    :placeholder="placeholder"
    class="h-80"
    @update:open="value => emit('updateOpen', value)">
    <template #empty>
      <div class="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
        {{ t('common.no_records') }}
      </div>
    </template>
  </UCommandPalette>
</template>
