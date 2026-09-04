<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { ref } from 'vue'
import type { Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const abilityHelpers = useCan()
const { can, canAny } = abilityHelpers
const canManageAssignments = abilityHelpers.canManageAssignments ?? (() => false)
const { user, signOut } = useAuth()

const open: Ref<boolean> = ref(false)
const canViewAdminGwcoa = computed(() => can('system', 'read', { type: 'global' }))
const canViewAgencies = computed(() => canAny('agency', 'read'))
const canViewUsers = computed(() => canAny('user', 'read'))
const canViewApplicantRecipients = computed(() => canAny('applicant_recipient', 'read'))
const canViewAgreements = computed(() => canAny('agreement', 'read'))
const canViewTransferPayments = computed(() => canAny('transfer_payment', 'read'))
const canViewRoles = computed(() => canAny('role', 'read'))
const assignmentManagementSubjects = [
  'agreement', 'applicant_recipient'
] as const
const canViewAssignmentManagement = computed(() =>
  assignmentManagementSubjects.some(subject => canManageAssignments(subject))
)
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

const items = computed(
  () =>
    [
      [
        {
          label: t('nav.home'),
          icon: 'i-lucide-house',
          to: localePath(appRouteLocations.home()),
          onSelect: () => {
            open.value = false
          }
        },
        ...(canViewAgencies.value
          ? [
              {
                label: t('nav.agencies'),
                icon: 'i-lucide-settings',
                to: localePath(appRouteLocations.agencies()),
                defaultOpen: true,
                type: 'trigger'
              }
            ]
          : []),
        ...(canViewTransferPayments.value
          ? [{
              label: t('nav.transfer_payments'),
              icon: 'i-lucide-banknote',
              to: localePath(appRouteLocations.transferPayments())
            }]
          : []),
        ...(canViewAgreements.value
          ? [
              {
                label: t('nav.agreements'),
                icon: 'i-lucide-file-signature',
                to: localePath(appRouteLocations.agreements())
              }
            ]
          : []),
        ...(canViewApplicantRecipients.value
          ? [
              {
                label: t('nav.applicant_recipients'),
                icon: 'i-lucide-store',
                to: localePath(appRouteLocations.proponents())
              }
            ]
          : []),
        ...(canViewAssignmentManagement.value
          ? [{
              label: t('nav.assignment_management'),
              icon: 'i-lucide-users-round',
              to: localePath(appRouteLocations.assignmentManagement())
            }]
          : []),
        ...(canViewRoles.value
          ? [{
              label: t('role.title'),
              icon: 'i-lucide-shield',
              to: localePath(appRouteLocations.roles())
            }]
          : []),
        ...(canViewUsers.value
          ? [
              {
                label: t('nav.users'),
                icon: 'i-lucide-user-round',
                to: localePath(appRouteLocations.users())
              }
            ]
          : []),
        ...(canViewAdminGwcoa.value
          ? [
              {
                label: t('admin_common.resources.gwcoa'),
                icon: 'i-lucide-database',
                to: localePath(appRouteLocations.adminGwcoa())
              }
            ]
          : [])
      ]
    ] as NavigationMenuItem[][]
)

const groups = computed(() => [
  {
    id: 'links',
    label: t('common.actions'),
    items: items.value.flat()
  }
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
    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>
