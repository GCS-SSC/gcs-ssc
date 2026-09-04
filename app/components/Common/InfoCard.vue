<script setup lang="ts">
const { title, description, icon, iconColor } = defineProps<{
  title: string
  description: string
  icon: string
  iconColor?: string
}>()
</script>

<template>
  <UCard class="group hover:ring-primary/50 overflow-hidden rounded-2xl shadow-sm transition-all duration-300">
    <div class="space-y-4 p-2">
      <div
        class="flex size-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
        :class="[
          iconColor === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' : '',
          iconColor === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-900/30' : '',
          !iconColor || iconColor === 'zinc' ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800' : ''
        ]">
        <UIcon :name="icon" class="size-6" />
      </div>
      <div>
        <h3 class="mb-1 text-lg font-black">
          {{ title }}
        </h3>
        <p class="text-sm text-zinc-500">
          {{ description }}
        </p>
      </div>
    </div>
  </UCard>
</template>
