<!-- eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -->
<script setup lang="ts">
import type { TreeItem } from '@nuxt/ui'
import { computed, ref } from 'vue'
import type { AssessmentAnswerPathTreeNode } from '~/utils/assessment-schema'

const modelValue = defineModel<string>({ required: true })

const {
  tree = [],
  label,
  placeholder = '',
  buttonClass = ''
} = defineProps<{
  tree?: AssessmentAnswerPathTreeNode[]
  label?: string
  placeholder?: string
  buttonClass?: string
}>()

const open = ref(false)

/** Maps the normalized answer-path tree into Nuxt UI tree items. */
const treeItems = computed<TreeItem[]>(() => tree)
/** Expands all section and subsection nodes by default for faster scanning. */
const expanded = computed(() => tree.flatMap(section => {
  const keys: string[] = [section.id]
  section.children?.forEach(child => {
    keys.push(child.id)
  })
  return keys
}))

/** Resolves the selected node label for the trigger button. */
const selectedLabel = computed(() => {
  const findLabel = (nodes: AssessmentAnswerPathTreeNode[]): string => {
    for (const node of nodes) {
      if (node.value === modelValue.value) {
        return node.label
      }

      if (node.children?.length) {
        const childLabel = findLabel(node.children)
        if (childLabel) {
          return childLabel
        }
      }
    }

    return ''
  }

  return findLabel(tree)
})

/** Updates the current path from a selected leaf node. */
const handleSelection = (item: TreeItem | undefined) => {
  const value = typeof item?.value === 'string' ? item.value : ''
  if (!value) {
    return
  }

  modelValue.value = value
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      color="neutral"
      variant="outline"
      class="w-full cursor-default justify-between text-left font-medium normal-case tracking-normal"
      :class="buttonClass">
      <span class="truncate">{{ selectedLabel || placeholder }}</span>
      <template #trailing>
        <UIcon name="i-lucide-panel-left-open" class="size-4" />
      </template>
    </UButton>

    <template #content>
      <div class="w-[44rem] max-w-[calc(100vw-2rem)] space-y-3 p-4">
        <div v-if="label" class="px-1 text-xs font-black tracking-[0.18em] text-zinc-500 uppercase dark:text-zinc-400">
          {{ label }}
        </div>

        <div class="max-h-[28rem] overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <UTree
            :items="treeItems"
            :model-value="undefined"
            :default-expanded="expanded"
            color="primary"
            size="sm"
            :get-key="item => String(item.id)"
            :ui="{
              link: 'cursor-default rounded-md px-2 py-1.5 transition-colors hover:bg-primary/8 hover:text-primary data-[selected]:bg-primary/10 data-[selected]:text-primary',
              linkLeadingIcon: 'size-4',
              linkTrailing: 'ml-auto',
              linkLabel: 'whitespace-normal break-words text-sm leading-5'
            }"
            @update:model-value="value => handleSelection(value as TreeItem | undefined)" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
