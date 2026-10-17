<script setup lang="ts">
import { useAttrs, useSlots, useTemplateRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'

defineOptions({ inheritAttrs: false })

const { ariaLabel } = defineProps<{
  ariaLabel?: string
}>()
const attrs = useAttrs()
const slots = useSlots()
const button = useTemplateRef<ComponentPublicInstance>('button')

defineExpose({
  /**
   * Keep popover and dropdown trigger references on the actual button.
   * @returns The underlying interactive element.
   */
  get $el() { return button.value?.$el }
})
const hasTooltip = () => Boolean(ariaLabel && attrs.icon && !attrs.label && !slots.default)
</script>

<template>
  <UTooltip :text="hasTooltip() ? ariaLabel : undefined" :disabled="!hasTooltip()">
    <UButton ref="button" v-bind="$attrs" :aria-label="ariaLabel">
      <template v-for="(_, name) in $slots" #[name]="slotData">
        <slot :name="name" v-bind="slotData || {}" />
      </template>
    </UButton>
  </UTooltip>
</template>
