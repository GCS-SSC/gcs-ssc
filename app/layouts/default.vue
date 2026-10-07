<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { ExtensionAgencyWorkspaceListItem } from '~~/shared/types/schemas/extensions'
import { useNavigationCatalog } from '~/composables/useNavigationCatalog'

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const abilityHelpers = useCan()
const { can } = abilityHelpers
const { user, signOut } = useAuth()
const route = useRoute()
const agencyWorkspaces: Ref<ExtensionAgencyWorkspaceListItem[]> = ref([])
let workspaceRequestSequence = 0
/** Refreshes Portal-style main-menu entries after navigation or RBAC changes. */
const loadAgencyWorkspaces = async () => {
  const sequence = ++workspaceRequestSequence
  try {
    const response = await fetch(getClientRequestUrl('/api/extensions/workspaces'))
    const result = response.ok
      ? (await response.json()) as { items: ExtensionAgencyWorkspaceListItem[] }
      : { items: [] }
    if (sequence !== workspaceRequestSequence) return
    agencyWorkspaces.value = result.items
  } catch {
    if (sequence !== workspaceRequestSequence) return
    agencyWorkspaces.value = []
  }
}
watch(() => route.fullPath, loadAgencyWorkspaces, { immediate: true })

const canViewAdminGwcoa = computed(() => can('system', 'read', { type: 'global' }))
const { items, pages } = useNavigationCatalog(agencyWorkspaces)
const userDisplayName = computed(() => {
  if (!user.value) return ''
  if (!user.value.name) return ''
  return user.value.name
})
const userDisplayEmail = computed(() => {
  if (!user.value) return ''
  if (!user.value.email) return ''
  return user.value.email
})
const isSigningOut: Ref<boolean> = ref(false)

/** Invalidates the current session before navigating to the localized login page. */
const handleLogout = async () => {
  if (isSigningOut.value) return
  try {
    isSigningOut.value = true
    const result = await signOut()
    if (result?.error) {
      toast.add({ title: t('common.error'), description: t('common.logout_failed'), color: 'error' })
      return
    }
    await navigateTo(localePath(appRouteLocations.login()))
  } catch {
    toast.add({ title: t('common.error'), description: t('common.logout_failed'), color: 'error' })
  } finally {
    isSigningOut.value = false
  }
}

const downloadAdminSqlDump = () => {
  globalThis.location.assign('/api/admin/dump')
}

const userMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    ...(canViewAdminGwcoa.value
      ? [
          {
            label: t('common.download_sql_dump'),
            icon: 'i-lucide-database-backup',
            onSelect: downloadAdminSqlDump
          }
        ]
      : []),
    {
      label: t('common.logout'),
      icon: 'i-lucide-log-out',
      onSelect: handleLogout
    }
  ]
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      collapsible
      resizable
      :ui="{
        footer: 'border-t border-zinc-200 dark:border-zinc-800 p-4',
        header: 'p-4 border-b border-zinc-200 dark:border-zinc-800'
      }"
      class="relative">
      <template #header="{ collapsed }">
        <div v-if="!collapsed" class="flex flex-row items-center gap-3">
          <img src="/images/gcs-ssc-logo.svg" class="w-10 object-contain">
          <div class="flex flex-col">
            <span class="text-lg leading-tight font-black tracking-tighter text-zinc-900 dark:text-white">GCS-SSC</span>
          </div>
        </div>
        <div v-else class="mx-auto">
          <img src="/images/gcs-ssc-logo.svg" class="size-6 object-contain">
        </div>
      </template>

      <template #default="{ collapsed }">
        <div class="bg-primary pointer-events-none absolute top-0 left-0 h-full w-1 opacity-80" />

        <UDashboardSearchButton
          :collapsed="collapsed"
          :label="t('global_search.button')"
          :aria-label="t('global_search.button')"
          class="hover:ring-primary mb-6 bg-white ring-1 ring-zinc-200 transition-all dark:bg-zinc-900 dark:ring-zinc-800" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="items[0]"
          orientation="vertical"
          :ui="{
            link: `font-black uppercase tracking-widest text-xs py-3 ${collapsed ? 'px-1.5' : 'px-4'} rounded-lg transition-colors data-[active]:text-primary data-[active]:bg-primary/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/50`
          }" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="items[1]"
          orientation="vertical"
          class="mt-auto"
          :ui="{
            link: `font-black uppercase tracking-widest text-xs py-2 ${collapsed ? 'px-1.5' : 'px-4'} rounded-lg opacity-60 hover:opacity-100 transition-opacity`
          }" />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-4">
          <UDropdownMenu
            :items="userMenuItems"
            :content="{ align: 'center', collisionPadding: 12 }"
            :ui="{
              content: collapsed ? 'w-40' : 'w-(--reka-dropdown-menu-trigger-width)'
            }">
            <UButton
              icon="i-lucide-user-round"
              :label="collapsed ? undefined : userDisplayName"
              :description="collapsed ? undefined : userDisplayEmail"
              :aria-label="t('common.account_menu')"
              :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
              color="neutral"
              variant="ghost"
              block
              :square="collapsed"
              class="data-[state=open]:bg-elevated"
              :class="[!collapsed && 'py-2.5']"
              :ui="{
                trailingIcon: 'text-dimmed'
              }" />
          </UDropdownMenu>
        </div>
      </template>
    </UDashboardSidebar>
    <CommonGlobalSearchPalette :pages="pages" />

    <slot />
  </UDashboardGroup>
</template>
