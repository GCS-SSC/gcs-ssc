<script setup lang="ts">
import lucideIcons from '@iconify-json/lucide/icons.json'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

const model = defineModel<string>({ required: true })
const { disabled = false } = defineProps<{ disabled?: boolean }>()
const { t } = useI18n()
const isOpen: Ref<boolean> = ref(false)
const search: Ref<string> = ref('')
const iconNames = Object.keys(lucideIcons.icons).map(name => `i-lucide-${name}`)
const filteredIcons = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  if (query.length === 0) return iconNames.slice(0, 120)
  return iconNames.filter(icon => icon.includes(query)).slice(0, 120)
})

watch(isOpen, open => {
  if (!open) search.value = ''
})

const selectIcon = (icon: string): void => {
  model.value = icon
  isOpen.value = false
}
</script>

<template>
  <UPopover v-model:open="isOpen">
    <UButton
      type="button"
      color="neutral"
      variant="outline"
      class="w-full justify-start"
      :disabled="disabled">
      <template #leading>
        <UIcon :name="model || 'i-lucide-circle'" class="size-4" />
      </template>
      <span class="truncate text-sm">
        {{ model || t('common.choose_icon') }}
      </span>
    </UButton>

    <template #content>
      <div class="w-[min(26rem,calc(100vw-2rem))] space-y-3 p-3">
        <UInput v-model="search" :placeholder="t('common.search_icons')" icon="i-lucide-search" autofocus />
        <div
          v-if="filteredIcons.length"
          class="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto pr-1 sm:grid-cols-3"
          role="group"
          :aria-label="t('common.choose_icon')">
          <UButton
            v-for="icon in filteredIcons"
            :key="icon"
            type="button"
            color="neutral"
            :variant="icon === model ? 'soft' : 'ghost'"
            class="justify-start text-xs"
            :aria-label="icon.replace('i-lucide-', '')"
            :aria-pressed="icon === model"
            @click="selectIcon(icon)">
            <template #leading>
              <UIcon :name="icon" class="size-4" />
            </template>
            <span class="truncate">{{ icon.replace('i-lucide-', '') }}</span>
          </UButton>
        </div>
        <p v-else class="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {{ t('common.no_results') }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
