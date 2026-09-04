<script setup lang="ts">
const {
  title,
  defaultOpen = false,
  level = 'top',
  persistenceKey
} = defineProps<{
  title: string
  defaultOpen?: boolean
  level?: 'top' | 'sub'
  persistenceKey?: string
}>()

const route = useRoute()
const localValue = ref<string[]>(defaultOpen ? ['content'] : [])
const persistedExpansion = useState<Record<string, boolean>>('authoring-accordion-expansion', () => ({}))
const scopedPersistenceKey = computed(() => persistenceKey
  ? `${String(route.params.schemaId ?? 'shared')}:${persistenceKey}`
  : null)
const accordionValue = computed<string[]>({
  /** @returns The locally or route-persisted expanded item value. */
  get: () => {
    const key = scopedPersistenceKey.value
    if (!key) return localValue.value
    const persisted = persistedExpansion.value[key]
    return (persisted ?? defaultOpen) ? ['content'] : []
  },
  /** @param value The newly expanded accordion item values. */
  set: (value) => {
    localValue.value = value
    const key = scopedPersistenceKey.value
    if (key) persistedExpansion.value[key] = value.includes('content')
  }
})

const items = computed(() => [
  {
    label: title,
    value: 'content'
  }
])

const triggerClass = computed(() => {
  if (level === 'sub') {
    return 'group w-full border-y border-x-0 border-zinc-300 bg-zinc-200/80 px-4 py-3 text-left text-base font-bold text-zinc-900 transition-colors hover:border-primary/50 hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-zinc-600 dark:bg-zinc-700/75 dark:text-zinc-100 dark:hover:border-primary/60 dark:hover:bg-primary/20 dark:hover:text-primary'
  }

  return 'group w-full border-y border-x-0 border-zinc-200 bg-zinc-50/80 px-4 py-3 text-left text-base font-bold text-zinc-900 transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30 dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-100 dark:hover:border-primary/55 dark:hover:bg-primary/15 dark:hover:text-primary'
})
</script>

<template>
  <UAccordion
    v-model="accordionValue"
    :items="items"
    type="multiple"
    :unmount-on-hide="false"
    :ui="{
      root: 'border-default border-t',
      item: 'border-b-0',
      header: 'm-0',
      trigger: triggerClass,
      body: 'px-4 pb-5 pt-3',
      content: 'data-[state=open]:animate-none'
    }">
    <template #body>
      <slot />
    </template>
  </UAccordion>
</template>
