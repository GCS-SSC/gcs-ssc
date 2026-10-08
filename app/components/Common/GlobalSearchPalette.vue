<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- Palette presentation and actions are local. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { nanoid } from 'nanoid'
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'
import type { SearchResult } from '~~/shared/types/search'
import type { NavigationCatalogItem } from '~/composables/useNavigationCatalog'
import { usePaletteSearch } from '~/composables/usePaletteSearch'

type PaletteItem = CommandPaletteItem & { result?: SearchResult }
const { pages } = defineProps<{ pages: NavigationCatalogItem[] }>()
const { t, locale, te } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const { getBilingualValue } = useBilingualValue()
const searchInputId = `global-search-${nanoid()}`
const open: Ref<boolean> = ref(false)
const searchTerm: Ref<string> = ref('')
const { response, loading, failed, retry } = usePaletteSearch(open, searchTerm, locale)
let returnFocus: HTMLElement | null = null
watch(open, value => {
  if (value) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  else searchTerm.value = ''
}, { flush: 'sync' })
const restoreFocus = (event: Event) => {
  if (!returnFocus?.isConnected) return
  event.preventDefault()
  returnFocus.focus({ preventScroll: true })
}
const typed = computed(() => searchTerm.value.trim().length > 0)
const inputProps = computed(() => ({
  'id': searchInputId,
  'aria-label': t('global_search.input_label'),
  'maxlength': 200,
  'autocomplete': 'off',
  'aria-required': false,
  'autofocus': true
}))
const closeProps = computed(() => ({
  'aria-label': t('global_search.close'), 'color': 'neutral' as const, 'variant': 'ghost' as const
}))
const matchingPages = computed(() => {
  const text = searchTerm.value.trim().toLocaleLowerCase()
  if (!text) return pages
  return pages.filter(page => page.searchLabels.some(label => label.toLocaleLowerCase().includes(text)))
    .sort((left, right) => Number(right.searchLabels.some(label => label.toLocaleLowerCase().startsWith(text)))
      - Number(left.searchLabels.some(label => label.toLocaleLowerCase().startsWith(text))))
})
const typeLabel = (type: string): string => {
  const rootKey = `global_search.types.${type}`
  if (te(rootKey)) return t(rootKey)
  const workKey = `assignments.entity_types.${type}`
  return t(te(workKey) ? workKey : `enums.entity_type.${type}`)
}
const resultDestination = (url: string): string => {
  // Custom French paths require a registered route name, resolved from the API's English URL.
  const destination = router.resolve(localePath(url, 'en'))
  if (!destination.name) throw new Error('Search destination is not registered')
  return localePath({
    name: destination.name, params: destination.params, query: destination.query, hash: destination.hash
  })
}
const resultItem = (result: SearchResult): PaletteItem => {
  const identity = getBilingualValue(result, 'name', result.reference ?? `#${result.id}`)
  let reference = result.reference && result.reference !== identity ? result.reference : ''
  if (!result.reference && !identity.match(/#[0-9]+/g)?.includes(`#${result.id}`) && !identity.endsWith(`no ${result.id}`)) {
    reference = `#${result.id}`
  }
  const parent = getBilingualValue(result, 'parent', '')
  return {
    id: `${result.type}:${result.id}`,
    label: identity,
    description: [typeLabel(result.type), reference, parent].filter(Boolean).join(' · '),
    icon: 'i-lucide-file-search',
    to: resultDestination(result.url),
    result
  }
}
const groups = computed<CommandPaletteGroup<PaletteItem>[]>(() => {
  const pageGroup: CommandPaletteGroup<PaletteItem> = {
    id: 'pages', label: t('global_search.pages'), ignoreFilter: true,
    items: (typed.value ? matchingPages.value.slice(0, 5) : matchingPages.value).map(page => ({
      id: page.id, label: page.label, icon: page.icon, to: page.to
    }))
  }
  const workGroup: CommandPaletteGroup<PaletteItem> = {
    id: 'my-work', label: t('global_search.my_work'), ignoreFilter: true,
    items: response.value?.myWork.slice(0, 5).map(resultItem) ?? []
  }
  if (!typed.value) return [pageGroup, workGroup]
  return [
    { id: 'records', label: t('global_search.records'), ignoreFilter: true, items: response.value?.records.slice(0, 12).map(resultItem) ?? [] },
    workGroup, pageGroup
  ]
})
const runtimeState = (status: string): RuntimeState => status as RuntimeState
const truncated = computed(() => {
  const labels: string[] = []
  if (response.value?.hasMore.records) labels.push(t('global_search.records'))
  if (response.value?.hasMore.myWork) labels.push(t('global_search.my_work'))
  if (typed.value && matchingPages.value.length > 5) labels.push(t('global_search.pages'))
  return labels.join(', ')
})
</script>

<template>
  <UDashboardSearch
    v-model:open="open"
    :title="t('global_search.title')"
    :description="t('global_search.description')"
    :color-mode="false"
    :content="{ onCloseAutoFocus: restoreFocus }"
    :ui="{ modal: 'sm:max-w-2xl' }">
    <template #content>
      <label :for="searchInputId" class="block px-4 pt-3 text-xs font-medium text-muted">
        {{ t('global_search.input_label') }}
      </label>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        :loading="loading"
        :placeholder="t('global_search.placeholder')"
        :input="inputProps"
        :close="closeProps"
        :preserve-group-order="true"
        :fuse="{ resultLimit: Math.max(12, pages.length) }"
        :ui="{ content: 'max-h-[min(65dvh,32rem)]', itemDescription: 'whitespace-normal break-words', itemLabelBase: 'whitespace-normal break-words', itemTrailing: 'shrink-0' }"
        @update:model-value="open = false"
        @update:open="open = $event">
        <template #item-trailing="{ item }">
          <template v-if="item.result?.status">
            <CommonStatusBadge v-if="item.result.status === 'active'" variant="active" />
            <CommonLifecycleBadge
              v-else-if="item.result.type === 'commonreview' || item.result.type === 'commonrecommendation' || item.result.type === 'commondatacollection'"
              engine="runtime"
              :state="runtimeState(item.result.status)" />
            <CommonRecordState v-else :status-id="item.result.status" />
          </template>
          <UIcon name="i-lucide-arrow-up-right" class="size-4 text-muted" />
        </template>
        <template #empty>
          <p class="px-4 py-6 text-sm text-muted" role="status">
            {{ loading ? t('global_search.loading') : failed ? t('global_search.failed') : t('global_search.empty') }}
          </p>
        </template>
        <template #footer>
          <div class="flex w-full flex-col gap-2 px-3 py-2 text-xs text-muted">
            <div v-if="failed" role="alert" class="flex items-center justify-between gap-3">
              <span>{{ t('global_search.failed') }}</span>
              <UButton color="neutral" variant="outline" size="xs" :label="t('common.retry')" @click="retry" />
            </div>
            <p v-else-if="loading" role="status" aria-live="polite">
              {{ t('global_search.loading') }}
            </p>
            <template v-else-if="response">
              <p v-if="!typed && !response.myWork.length" role="status">
                {{ t('global_search.no_work') }}
              </p>
              <p v-if="typed && !response.records.length && !response.myWork.length" role="status">
                {{ t('global_search.no_remote_matches') }}
              </p>
              <p v-if="truncated" role="status">
                {{ t('global_search.truncated', { groups: truncated }) }}
              </p>
            </template>
            <p>{{ t('global_search.keyboard_hint') }}</p>
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UDashboardSearch>
</template>
