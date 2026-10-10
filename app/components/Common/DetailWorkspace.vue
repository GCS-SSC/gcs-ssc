<script setup lang="ts">
import { computed, useId } from 'vue'
import type { TranslatedTabItem } from '~~/shared/types/ui'

const { items, contentTestId, priorityValues = [], sectionDescription } = defineProps<{
  items: TranslatedTabItem[]
  contentTestId?: string
  priorityValues?: string[]
  sectionDescription?: string
}>()
const selectedTab = defineModel<string>({ required: true })
const { t } = useI18n()
const panelId = `detail-workspace-panel-${useId()}`
const selectedItem = computed(() => items.find(item => item.value === selectedTab.value))
const title = computed(() => selectedItem.value?.label ?? (selectedItem.value ? t(selectedItem.value.key) : ''))
</script>

<template>
  <CommonEntityEditorWorkspace :content-test-id="contentTestId">
    <template #sidebar>
      <CommonRouteTabs v-model="selectedTab" :items="items" :priority-values="priorityValues" :external-panel-id="panelId" orientation="vertical" :ui="{ root: 'w-full', list: 'w-full flex-col items-stretch p-0', trigger: 'w-full justify-start' }" />
    </template>
    <CommonDetailSection :id="panelId" role="tabpanel" :aria-label="title" :title="title" :description="sectionDescription">
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
