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

/**
 * Keeps a pending Save focused while blocking mouse and keyboard activation.
 * @param event - The activation that would otherwise submit or invoke a caller.
 */
const preventDisabledActivation = (event: MouseEvent) => {
  if (!isDisabled.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
}
</script>

<template>
  <UButton
    :type="type"
    :label="label"
    :loading="false"
    :loading-auto="false"
    :disabled="disabled && !loading"
    :aria-disabled="isDisabled || undefined"
    :aria-busy="loading || undefined"
    :color="color"
    :variant="variant"
    :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-save'"
    :class="{ '[&_[data-slot=leadingIcon]]:animate-spin': loading }"
    class="cursor-default"
    @click.capture="preventDisabledActivation" />
</template>
