<script setup lang="ts">
import { computed } from 'vue'
import type { TranslatedTabItem } from '~~/shared/types/ui'
import { getDetailSectionPresentation } from '~/utils/detail-sections'
import type { DetailSectionWidth } from '~/utils/detail-sections'

const { items, contentTestId, priorityValues = [], sectionDescription, sectionWidth } = defineProps<{
  items: TranslatedTabItem[]
  contentTestId?: string
  priorityValues?: string[]
  sectionDescription?: string
  sectionWidth?: DetailSectionWidth
}>()
const selectedTab = defineModel<string>({ required: true })
const { t } = useI18n()
const selectedItem = computed(() => items.find(item => item.value === selectedTab.value))
const title = computed(() => selectedItem.value?.label ?? (selectedItem.value ? t(selectedItem.value.key) : ''))
const presentation = computed(() => getDetailSectionPresentation(selectedItem.value?.key ?? ''))
const description = computed(() => sectionDescription ?? (presentation.value.descriptionKey ? t(presentation.value.descriptionKey) : undefined))
</script>

<template>
  <CommonEntityEditorWorkspace :content-test-id="contentTestId">
    <template #sidebar>
      <CommonRouteTabs v-model="selectedTab" :items="items" :priority-values="priorityValues" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
    </template>
    <CommonDetailSection :title="title" :description="description" :width="sectionWidth ?? presentation.width">
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
      <template v-if="$slots.notices" #notices>
        <slot name="notices" />
      </template>
      <slot />
    </CommonDetailSection>
  </CommonEntityEditorWorkspace>
</template>
