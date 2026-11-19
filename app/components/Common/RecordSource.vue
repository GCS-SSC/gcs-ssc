<script setup lang="ts">
import { ref } from 'vue'

const { label, buttonLabel, title, description } = defineProps<{
  label: string
  buttonLabel: string
  title: string
  description: string
}>()

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description">
    <UButton
      type="button"
      color="primary"
      variant="outline"
      size="xs"
      :label="label"
      :aria-label="buttonLabel" />
    <template #body>
      <slot />
    </template>
    <template #footer>
      <UButton class="ml-auto" color="neutral" variant="outline" :label="t('common.close')" @click="open = false" />
    </template>
  </UModal>
</template>
