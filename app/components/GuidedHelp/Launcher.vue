<script setup lang="ts">
import { ref } from 'vue'
import { useGuidedHelpDiscovery } from '~/composables/useGuidedHelpDiscovery'

const { t, locale } = useI18n()
const { items, loading, active, requestedGuideId } = useGuidedHelpDiscovery()
const open = ref(false)
/** Distinguish eligible agency publications on collection screens.
 * @param item Published catalog guide.
 * @returns Localized title and agency when supplied by collection discovery.
 */
const guideLabel = (item: (typeof items.value)[number]) => {
  const language = locale.value === 'fr' ? 'fr' : 'en'
  const agency = item.agencyName?.[language]
  return item.document.title[language] + (agency ? ` — ${agency}` : '')
}
/**
 * Start a chosen guide through the launch authorization boundary.
 * @param id Agency catalog guide identity.
 */
const launch = (id: string) => {
  open.value = false
  requestedGuideId.value = id
}
</script>

<template>
  <template v-if="items.length && !active">
    <UButton v-if="items.length === 1" :label="t('guided_help.help')" icon="i-lucide-circle-help" color="neutral" variant="soft" class="bg-violet-100 px-6 text-violet-800 hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-violet-400/15 dark:text-violet-200 dark:hover:bg-violet-400/25 dark:focus-visible:ring-violet-300 dark:focus-visible:ring-offset-zinc-900" :disabled="loading" @click="launch(items[0]!.id)" />
    <UPopover v-else v-model:open="open" :content="{ align: 'end' }">
      <UButton :label="t('guided_help.help')" icon="i-lucide-circle-help" color="neutral" variant="soft" class="bg-violet-100 px-6 text-violet-800 hover:bg-violet-200 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-violet-400/15 dark:text-violet-200 dark:hover:bg-violet-400/25 dark:focus-visible:ring-violet-300 dark:focus-visible:ring-offset-zinc-900" :disabled="loading" />
      <template #content>
        <div class="max-w-sm p-3">
          <h2 class="mb-2 font-semibold">
            {{ t('guided_help.help') }}
          </h2>
          <ul class="space-y-1">
            <li v-for="item in items" :key="item.id">
              <UButton :label="guideLabel(item)" variant="ghost" color="neutral" :ui="{ label: 'whitespace-normal break-words' }" class="w-full justify-start whitespace-normal text-left" @click="launch(item.id)" />
            </li>
          </ul>
        </div>
      </template>
    </UPopover>
  </template>
</template>
