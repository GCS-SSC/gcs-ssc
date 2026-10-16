<script setup lang="ts">
import { ref } from 'vue'
import { useGuidedHelpDiscovery } from '~/composables/useGuidedHelpDiscovery'

const { t, locale } = useI18n()
const { items, loading, active, requestedGuideId } = useGuidedHelpDiscovery()
const open = ref(false)
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
    <UButton v-if="items.length === 1" :label="t('guided_help.help')" icon="i-lucide-circle-help" color="warning" variant="soft" class="px-6" :disabled="loading" @click="launch(items[0]!.id)" />
    <UPopover v-else v-model:open="open" :content="{ align: 'end' }">
      <UButton :label="t('guided_help.help')" icon="i-lucide-circle-help" color="warning" variant="soft" class="px-6" :disabled="loading" />
      <template #content>
        <div class="max-w-sm p-3">
          <h2 class="mb-2 font-semibold">
            {{ t('guided_help.help') }}
          </h2>
          <ul class="space-y-1">
            <li v-for="item in items" :key="item.id">
              <UButton :label="item.document.title[locale === 'fr' ? 'fr' : 'en']" variant="ghost" color="neutral" :ui="{ label: 'whitespace-normal break-words' }" class="w-full justify-start whitespace-normal text-left" @click="launch(item.id)" />
            </li>
          </ul>
        </div>
      </template>
    </UPopover>
  </template>
</template>
