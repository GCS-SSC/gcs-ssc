<script setup lang="ts">
const { title, icon, badge, buttonLabel, showButton, variant } = defineProps<{
  title: string
  icon?: string
  badge?: string | number
  buttonLabel?: string
  showButton?: boolean
  variant?: 'default' | 'ghost'
}>()

defineEmits(['add'])
</script>

<template>
  <div
    class="flex items-center justify-between group data-[variant=default]:border-default data-[variant=default]:rounded-xl data-[variant=default]:border data-[variant=default]:bg-white data-[variant=default]:shadow-sm data-[variant=default]:dark:bg-zinc-900/50 data-[variant=default]:p-4 data-[variant=ghost]:p-0"
    :data-variant="variant || 'default'">
    <h3
      class="flex items-center gap-2 font-black tracking-widest uppercase text-sm text-zinc-900 dark:text-white">
      <div
        v-if="badge"
        class="bg-primary/10 text-primary flex size-6 items-center justify-center rounded-lg text-xs">
        {{ badge }}
      </div>
      <UIcon
        v-else-if="icon"
        :name="icon"
        class="text-primary size-5" />
      {{ title }}
    </h3>
    <UButton
      v-if="showButton !== false && buttonLabel"
      :label="buttonLabel"
      icon="i-lucide-plus"
      class="rounded-lg"
      size="sm"
      @click="$emit('add')" />
  </div>
</template>
