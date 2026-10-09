<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const { embedded, panelId, breadcrumbItems } = defineProps<{ embedded: boolean, panelId: string, breadcrumbItems: BreadcrumbItem[] }>()
const collapsed = defineModel<boolean>('collapsed', { required: true })
</script>

<template>
  <div v-if="embedded" class="min-w-0 space-y-8" data-testid="questionnaire-runtime-inline">
    <slot />
  </div>
  <CommonDetailPage v-else :id="panelId" v-model:collapsed="collapsed" :breadcrumb-items="breadcrumbItems">
    <template #body>
      <slot />
    </template>
  </CommonDetailPage>
</template>
