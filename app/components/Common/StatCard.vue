<script setup lang="ts">
const { title, value, icon, color, trend, progress } = defineProps<{
  title: string
  value: string | number
  icon: string
  color?: string
  trend?: string
  progress?: number
  isFirst?: boolean
}>()
</script>

<template>
  <UCard
    class="group relative overflow-hidden rounded-2xl"
    :ui="{
      body: 'p-8',
      root: 'ring-1 ring-zinc-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900 transition-all hover:shadow-xl hover:-tranzinc-y-2 duration-300'
    }">
    <!-- Background subtle pattern/icon -->
    <UIcon
      :name="icon"
      class="absolute -right-8 -bottom-8 size-40 -rotate-12 text-zinc-50 transition-transform duration-500 group-hover:rotate-0 dark:text-zinc-800/20" />

    <div class="relative flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div
          class="flex size-12 items-center justify-center rounded-xl shadow-sm transition-colors"
          :class="{
            'bg-blue-600 text-white': color === 'blue',
            'bg-zinc-600 text-white': color === 'slate',
            'bg-primary-600 text-white': color === 'primary',
            'bg-red-600 text-white': color === 'red'
          }">
          <UIcon :name="icon" class="size-6" />
        </div>

        <span
          v-if="trend"
          class="bg-success/10 text-success flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black tracking-tight uppercase">
          <UIcon name="i-lucide-trending-up" class="size-3" />
          <span>{{ trend }}</span>
        </span>
      </div>

      <div class="space-y-1">
        <span class="text-xs leading-none font-black tracking-[0.2em] text-zinc-400 uppercase dark:text-zinc-500">
          {{ title }}
        </span>
        <div class="flex items-baseline gap-2">
          <span class="text-4xl font-black tracking-tighter text-zinc-900 tabular-nums dark:text-white">
            {{ value }}
          </span>
        </div>
      </div>

      <div v-if="progress" class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          class="h-full transition-all delay-200 duration-1000 ease-out"
          :class="{
            'bg-blue-600': color === 'blue',
            'bg-zinc-600': color === 'slate',
            'bg-primary-600': color === 'primary',
            'bg-red-600': color === 'red'
          }"
          :style="{ width: progress + '%' }" />
      </div>
    </div>
  </UCard>
</template>
