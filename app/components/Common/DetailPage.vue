<script setup lang="ts">
import { computed } from 'vue'
import type { BreadcrumbItem } from '@nuxt/ui'

const { id, title, breadcrumbItems, helpReturnTarget, helpReturnEnabled = true, showHeroToggle = true } = defineProps<{
  id: string
  helpReturnTarget?: string
  helpReturnEnabled?: boolean
  showHeroToggle?: boolean
} & ({ title: string, breadcrumbItems?: never } | { title?: never, breadcrumbItems: BreadcrumbItem[] })>()
const collapsed = defineModel<boolean>('collapsed', { required: true })
const { t } = useI18n()
const renderedBreadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items = breadcrumbItems ?? []
  return items.map((item, index) => {
    if (index === 0 && helpReturnEnabled && helpReturnTarget && item.to) {
      return { ...item, to: undefined, slot: 'help-return', ui: { ...item.ui, item: (defaults: string) => [typeof item.ui?.item === 'function' ? item.ui.item(defaults) : [defaults, item.ui?.item], 'shrink-0 max-w-full'] } }
    }
    if (index === items.length - 1 && !item.to && !item.href) return { ...item, active: item.active ?? true }
    return item
  })
})
</script>

<template>
  <UDashboardPanel :id="id" class="min-w-0 flex-1">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBreadcrumb v-if="title === undefined" :aria-label="t('common.breadcrumb')" :items="renderedBreadcrumbItems" :ui="{ list: 'overflow-hidden' }" class="ml-2">
            <template #help-return>
              <NuxtLink v-if="breadcrumbItems?.[0]?.to" :to="breadcrumbItems[0].to" :data-help-target="helpReturnTarget" class="truncate min-w-0 py-3 text-muted hover:text-default">
                {{ breadcrumbItems[0].label }}
              </NuxtLink>
            </template>
          </UBreadcrumb>
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <slot name="navbar-actions" />
            <CommonActionButton v-if="showHeroToggle" color="neutral" variant="ghost" :icon="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" :aria-label="t(collapsed ? 'common.expand' : 'common.collapse')" @click="collapsed = !collapsed" />
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
