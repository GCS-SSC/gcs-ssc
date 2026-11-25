<script setup lang="ts" generic="T extends { id: string }">
import { computed, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'

const { events, snapshots, snapshotLabel } = defineProps<{
  events: readonly {
    id: string
    title: string
    datetime: string
    actor: string
    revisionLabel?: string
    section?: string
    description?: string | null
  }[]
  snapshots: readonly T[]
  snapshotLabel: (snapshot: T, index: number) => string
}>()

defineSlots<{
  comparison: (props: { before: T; after: T }) => unknown
  snapshot: (props: { snapshot: T; previous: T | undefined; index: number }) => unknown
}>()

type Comparison = { kind: 'unavailable' } | { kind: 'selected'; earlier: string; later: string }

const { t, locale } = useI18n()
const comparison: Ref<Comparison> = shallowRef({ kind: 'unavailable' })
const versions = computed(() => snapshots.map((snapshot, index) => ({
  value: snapshot.id,
  label: snapshotLabel(snapshot, index)
})))
const before = computed(() => {
  const state = comparison.value
  return state.kind === 'selected' ? snapshots.find(snapshot => snapshot.id === state.earlier) : undefined
})
const after = computed(() => {
  const state = comparison.value
  return state.kind === 'selected' ? snapshots.find(snapshot => snapshot.id === state.later) : undefined
})
watch(() => snapshots, (next, previous) => {
  const earlier = next.at(-2)
  const later = next.at(-1)
  if (!earlier || !later) {
    comparison.value = { kind: 'unavailable' }
  } else if (later.id !== previous?.at(-1)?.id || !before.value || !after.value) {
    comparison.value = { kind: 'selected', earlier: earlier.id, later: later.id }
  }
}, { immediate: true })

/**
 * Updates one side of the comparison when the selector has a current version.
 * @param side - Version selection to update.
 * @param id - Captured version ID.
 */
const selectVersion = (side: 'earlier' | 'later', id: string) => {
  if (comparison.value.kind === 'selected' && snapshots.some(snapshot => snapshot.id === id)) {
    comparison.value = { ...comparison.value, [side]: id }
  }
}

const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
/**
 * Formats an event timestamp in the current reader's locale.
 * @param date - Captured event timestamp.
 * @returns Localized date and time.
 */
const dateTime = (date: string) => dateFormatter.value.format(new Date(date))
</script>

<template>
  <CommonDetailSection heading="h3" :title="t('submission.history')">
    <ol class="space-y-4 border-l border-default pl-5">
      <li v-for="event in events" :key="event.id" class="text-sm">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <strong class="text-highlighted">{{ event.title }}</strong>
          <time :datetime="event.datetime" class="text-muted">{{ dateTime(event.datetime) }}</time>
        </div>
        <p class="text-muted">
          {{ event.actor }}
          <span v-if="event.revisionLabel !== undefined"> · {{ event.revisionLabel }}</span>
          <span v-if="event.section !== undefined"> · {{ event.section }}</span>
        </p>
        <p v-if="event.description" class="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {{ event.description }}
        </p>
      </li>
    </ol>

    <section v-if="comparison.kind === 'selected'" class="min-w-0 space-y-4">
      <h4 class="font-semibold text-highlighted">
        {{ t('submission.compare') }}
      </h4>
      <div class="grid gap-3 sm:grid-cols-2" data-field-exclude="Snapshot comparison filters do not edit business data.">
        <UFormField :label="t('submission.before')">
          <USelect :model-value="comparison.earlier" :items="versions" class="w-full" @update:model-value="selectVersion('earlier', $event)" />
        </UFormField>
        <UFormField :label="t('submission.after')">
          <USelect :model-value="comparison.later" :items="versions" class="w-full" @update:model-value="selectVersion('later', $event)" />
        </UFormField>
      </div>
      <slot v-if="before && after" name="comparison" :before="before" :after="after" />
    </section>

    <div v-if="snapshots.length" class="divide-y divide-default overflow-hidden rounded-md border border-default">
      <details v-for="(snapshot, index) in snapshots" :key="snapshot.id" class="group/snapshot text-sm">
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 font-medium text-highlighted hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary group-open/snapshot:bg-elevated [&::-webkit-details-marker]:hidden">
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted group-open/snapshot:rotate-90" aria-hidden="true" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ versions[index]?.label }}</span>
        </summary>
        <div class="min-w-0 space-y-5 border-t border-default px-4 py-4 sm:px-5">
          <slot name="snapshot" :snapshot="snapshot" :previous="snapshots[index - 1]" :index="index" />
        </div>
      </details>
    </div>
  </CommonDetailSection>
</template>
