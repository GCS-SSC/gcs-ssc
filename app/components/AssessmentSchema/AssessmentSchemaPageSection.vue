<script setup lang="ts">
const { sectionId, title } = defineProps<{
  sectionId: string
  title: string
  extendIndicator?: boolean
  hideTitleIndicator?: boolean
  compact?: boolean
}>()
</script>

<template>
  <section :id="sectionId" class="scroll-mt-24">
    <div
      v-if="extendIndicator"
      class="grid gap-4 md:grid-cols-[0.1875rem_minmax(0,1fr)] md:items-stretch md:gap-6">
      <div class="hidden rounded-full bg-primary md:block" />

      <div class="space-y-3">
        <AssessmentSchemaSectionTitle :title="title" :hide-indicator="hideTitleIndicator" :compact="compact" variant="indicator">
          <template #actions>
            <slot name="actions" />
          </template>
        </AssessmentSchemaSectionTitle>

        <slot />
      </div>
    </div>

    <template v-else>
      <div :class="compact ? 'flex flex-col gap-1' : 'space-y-6'">
        <AssessmentSchemaSectionTitle :title="title" :hide-indicator="hideTitleIndicator" :compact="compact" variant="indicator">
          <template #actions>
            <slot name="actions" />
          </template>
        </AssessmentSchemaSectionTitle>

        <slot />
      </div>
    </template>
  </section>
</template>
