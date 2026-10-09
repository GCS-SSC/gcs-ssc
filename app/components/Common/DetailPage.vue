<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const { id, breadcrumbItems } = defineProps<{
  id: string
  breadcrumbItems: BreadcrumbItem[]
}>()
const collapsed = defineModel<boolean>('collapsed', { required: true })
const { t } = useI18n()
</script>

<template>
  <UDashboardPanel :id="id" class="min-w-0 flex-1">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :items="breadcrumbItems" class="ml-2" />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <slot name="navbar-actions" />
            <UButton color="neutral" variant="ghost" :icon="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(collapsed ? 'common.expand' : 'common.collapse')" @click="collapsed = !collapsed" />
            <CommonNavbarSide />
          </div>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <slot name="body">
        <slot />
      </slot>
    </template>
  </UDashboardPanel>
</template>
