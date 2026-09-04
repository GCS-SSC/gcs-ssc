<script setup lang="ts">
import { computed } from 'vue'

const {
  label,
  type = 'submit',
  loading = false,
  disabled = false,
  color = 'primary',
  variant = 'solid'
} = defineProps<{
  label: string
  type?: 'button' | 'submit'
  loading?: boolean
  disabled?: boolean
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'error'
  variant?: 'solid' | 'outline' | 'ghost' | 'soft' | 'subtle' | 'link'
}>()

const isDisabled = computed(() => loading || disabled)
</script>

<template>
  <UButton
    :type="type"
    :label="label"
    :loading="loading"
    :disabled="isDisabled"
    :color="color"
    :variant="variant"
    :icon="loading ? undefined : 'i-lucide-save'"
    class="cursor-default" />
</template>
