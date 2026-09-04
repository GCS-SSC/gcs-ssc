<script setup lang="ts">
import type { TranslatedTabItem } from '~~/shared/types/ui'

const selectedSection = defineModel<string>({ required: true })
const emit = defineEmits<{
  save: []
}>()

const {
  sectionTabs = [],
  isSaving = false,
  disabled = false,
  ui = {}
} = defineProps<{
  sectionTabs?: TranslatedTabItem[]
  isSaving?: boolean
  disabled?: boolean
  ui?: Record<string, string>
}>()

const { t } = useI18n()
</script>

<template>
  <aside class="w-full shrink-0 lg:sticky lg:top-6 lg:self-start lg:w-72 lg:border-r lg:border-zinc-200 lg:pr-4 dark:lg:border-zinc-800">
    <div class="space-y-5 pt-6">
      <CommonRouteTabs
        v-model="selectedSection"
        :items="sectionTabs"
        orientation="vertical"
        :ui="{
          root: 'w-full',
          list: 'w-full flex-col items-stretch p-0',
          trigger: 'w-full min-h-11 items-center justify-start py-2 leading-6 before:left-0 before:w-px before:rounded-full',
          ...ui
        }" />

      <div class="pt-1">
        <CommonSaveButton
          :label="t('common.save')"
          class="cursor-default px-6"
          :loading="isSaving"
          :disabled="disabled || isSaving"
          @click="emit('save')" />
      </div>
    </div>
  </aside>
</template>
