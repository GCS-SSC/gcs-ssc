<script setup lang="ts">
import { defineComponent, h } from 'vue'
import UNavigationMenu from '@nuxt/ui/components/NavigationMenu.vue'

const { label } = defineProps<{ label: string }>()
const NavigationRoot = defineComponent({
  inheritAttrs: false,
  /** Applies the landmark name at the public polymorphic root, after Reka's default.
   * @param _ Root props supplied by Reka.
   * @param context Root attributes and content.
   * @param context.attrs Forwarded keyboard, orientation and ref attributes.
   * @param context.slots Navigation contents.
   * @returns The single native navigation landmark.
   */
  setup: (_, { attrs, slots }) => () => h('nav', { ...attrs, 'aria-label': label }, slots.default?.())
})
</script>

<template>
  <UNavigationMenu :as="NavigationRoot" v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData || {}" />
    </template>
  </UNavigationMenu>
</template>
