<script setup lang="ts">
const { embedded, panelId } = defineProps<{ embedded: boolean, panelId: string }>()
</script>

<template>
  <div v-if="embedded" class="min-w-0 space-y-8" data-testid="questionnaire-runtime-inline">
    <slot />
  </div>
  <UDashboardPanel v-else :id="panelId">
    <template #header>
      <slot name="header" />
    </template>
    <template #body>
      <slot />
    </template>
  </UDashboardPanel>
</template>
