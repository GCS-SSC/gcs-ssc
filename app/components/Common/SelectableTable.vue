<script setup lang="ts" generic="T extends { id: string | number }">
const {
  items,
  selectedId,
  caption,
  getRowAriaLabel,
  isSelectable = () => true
} = defineProps<{
  items: T[]
  selectedId?: string | number | null
  caption: string
  getRowAriaLabel?: (item: T, selected: boolean) => string
  isSelectable?: (item: T) => boolean
}>()

const emit = defineEmits<{ select: [item: T] }>()
const isSelected = (item: T) => selectedId !== null && selectedId !== undefined && String(item.id) === String(selectedId)
const selectItem = (item: T) => {
  if (isSelectable(item)) emit('select', item)
}
</script>

<template>
  <div class="overflow-x-auto rounded-sm border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
    <table class="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
      <caption class="sr-only">
        {{ caption }}
      </caption>
      <thead>
        <tr class="bg-zinc-100 text-left text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:bg-zinc-900 dark:text-zinc-400">
          <slot name="header" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(item, index) in items"
          :key="String(item.id)"
          :aria-current="isSelected(item) ? 'true' : undefined"
          :class="[
            index > 0 && !isSelected(item) && !isSelected(items[index - 1]!) ? 'border-t border-zinc-200 dark:border-zinc-800' : '',
            isSelected(item) ? 'bg-blue-50/60 [&>:first-child]:shadow-[inset_4px_0_0_0_var(--ui-primary)] dark:bg-blue-950/20' : ''
          ]">
          <slot
            name="row"
            :item="item"
            :selected="isSelected(item)"
            :selectable="isSelectable(item)"
            :action-label="isSelectable(item) ? getRowAriaLabel?.(item, isSelected(item)) : undefined"
            :select="() => selectItem(item)" />
        </tr>
      </tbody>
    </table>
  </div>
</template>
