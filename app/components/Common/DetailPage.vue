<script setup lang="ts">
import { computed } from 'vue'
import type { BreadcrumbItem } from '@nuxt/ui'

const { id, breadcrumbItems, helpReturnTarget, helpReturnEnabled = true } = defineProps<{
  id: string
  breadcrumbItems: BreadcrumbItem[]
  helpReturnTarget?: string
  helpReturnEnabled?: boolean
}>()
const collapsed = defineModel<boolean>('collapsed', { required: true })
const { t } = useI18n()
const renderedBreadcrumbItems = computed<BreadcrumbItem[]>(() => breadcrumbItems.map((item, index) => {
  if (index === 0 && helpReturnEnabled && helpReturnTarget && item.to) {
    return { ...item, to: undefined, slot: 'help-return', ui: { ...item.ui, item: (defaults: string) => [typeof item.ui?.item === 'function' ? item.ui.item(defaults) : [defaults, item.ui?.item], 'shrink-0 max-w-full'] } }
  }
  if (index === breadcrumbItems.length - 1 && !item.to && !item.href) return { ...item, active: item.active ?? true }
  return item
}))
</script>

<template>
  <UDashboardPanel :id="id" class="min-w-0 flex-1">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb :aria-label="t('common.breadcrumb')" :items="renderedBreadcrumbItems" :ui="{ list: 'overflow-hidden' }" class="ml-2">
            <template #help-return>
              <NuxtLink v-if="breadcrumbItems[0]?.to" :to="breadcrumbItems[0].to" :data-help-target="helpReturnTarget" class="truncate min-w-0 py-3 text-muted hover:text-default">
                {{ breadcrumbItems[0].label }}
              </NuxtLink>
            </template>
          </UBreadcrumb>
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <slot name="navbar-actions" />
            <CommonActionButton color="neutral" variant="ghost" :icon="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(collapsed ? 'common.expand' : 'common.collapse')" @click="collapsed = !collapsed" />
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
