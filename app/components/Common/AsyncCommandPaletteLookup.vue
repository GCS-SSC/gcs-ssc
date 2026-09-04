<script setup lang="ts">
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { buildAsyncCommandPaletteLookupItems } from '~/utils/async-command-palette-lookup'
import { onBeforeUnmount } from 'vue'
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

const isLoading: Ref<boolean> = ref(false)
const searchTerm: Ref<string> = ref('')
const items: Ref<LookupItem[]> = ref([])
const searchTimeout: Ref<ReturnType<typeof setTimeout> | null> = ref(null)
let requestGeneration = 0
let requestController: AbortController | null = null

/**
 * Fetches lookup items for the current query and optional search term.
 *
 * @param search - Search text entered in the palette.
 */
const fetchItems = async (search = '') => {
  const generation = ++requestGeneration
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  try {
    isLoading.value = true
    const requestUrl = getClientRequestUrl(fetchUrl)
    requestUrl.searchParams.set('page', '1')
    requestUrl.searchParams.set('limit', String(limit))
    for (const [key, value] of Object.entries(query ?? {})) {
      requestUrl.searchParams.set(key, String(value))
    }
    if (search) {
      requestUrl.searchParams.set('search', search)
    }
    const fetchResponse = await fetch(requestUrl, { signal: controller.signal })
    if (!fetchResponse.ok) {
      await throwFetchResponseError(fetchResponse)
    }
    const response = await fetchResponse.json() as { items: LookupItem[] }

    if (generation === requestGeneration && !controller.signal.aborted) items.value = response.items
  } catch (error) {
    if (generation === requestGeneration && !controller.signal.aborted) {
      items.value = []
      showError(error)
    }
  } finally {
    if (generation === requestGeneration) isLoading.value = false
  }
}

watch(() => query, async () => {
  await fetchItems(searchTerm.value.trim())
}, { deep: true, immediate: true })

watch(searchTerm, value => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value)
  }

  searchTimeout.value = setTimeout(async () => {
    await fetchItems(value.trim())
  }, 200)
})

onBeforeUnmount(() => {
  requestGeneration += 1
  requestController?.abort()
  if (searchTimeout.value) clearTimeout(searchTimeout.value)
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
