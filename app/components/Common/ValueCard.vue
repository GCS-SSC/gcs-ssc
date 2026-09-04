<script setup lang="ts">
const { label, value, subValue, icon, variant, color } = defineProps<{
  label: string
  value: string | number
  subValue?: string
  icon?: string
  variant?: 'card' | 'ghost'
  color?: string
}>()
</script>

<template>
  <div
    v-if="variant === 'ghost'"
    class="flex items-start gap-4 rounded-2xl border border-transparent bg-zinc-100/50 p-6 transition-colors hover:border-zinc-200 dark:bg-zinc-800/30 dark:hover:border-zinc-700">
    <div
      v-if="icon"
      class="rounded-xl bg-white p-3 shadow-sm dark:bg-zinc-900"
      :class="[color ? `text-${color}-600` : 'text-primary']">
      <UIcon :name="icon" class="size-6" />
    </div>
    <div>
      <p class="mb-1 text-xs font-black tracking-widest text-zinc-400 uppercase">
        {{ label }}
      </p>
      <p class="text-lg font-black text-zinc-900 dark:text-white" :class="{ 'font-mono': typeof value === 'number' }">
        {{ value }}
      </p>
      <p v-if="subValue" class="text-xs text-zinc-500">
        {{ subValue }}
      </p>
    </div>
  </div>

  <UCard v-else class="border-none bg-white shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-800">
    <div class="space-y-1">
      <p class="mb-2 text-xs leading-none font-black tracking-widest text-zinc-400 uppercase dark:text-zinc-500">
        {{ label }}
      </p>
      <p class="mb-1 text-sm font-black text-zinc-900 dark:text-white">
        {{ value }}
      </p>
      <div v-if="subValue" class="flex items-center gap-2">
        <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500 uppercase dark:bg-zinc-800">
          {{ subValue }}
        </span>
      </div>
    </div>
  </UCard>
</template>
