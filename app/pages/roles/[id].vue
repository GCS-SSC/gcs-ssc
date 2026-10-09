<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param -- page-local handlers are clear from their names and types */
import type { ComputedRef, Ref } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import RolePermissionsTab from '~/components/Role/RolePermissionsTab.vue'
import RoleDetailGeneralTab from '~/components/Role/RoleDetailGeneralTab.vue'
import { useRouteTabMap } from '~/composables/useRouteTabMap'
import type { RoleInput, RolePermissionInput } from '~~/shared/types/schemas/rbac'
import type { RoleDetail } from '~~/shared/types/roles'
import { ROLE_ABILITY_SUBJECTS } from '@gcs-ssc/authorization'
import type { RoleAbilitySubject } from '~~/shared/utils/abilities'
import { getRoleScopeType, isAbilityAllowedForRoleScope } from '~~/shared/utils/role-scope'

definePageMeta({
  i18n: {
    paths: {
      en: '/roles/[id]',
      fr: '/roles/[id]'
    }
  }
})

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()
const toast = useToast()
const { showError } = useApiErrorToast()
const { saveJson } = useJsonRequest()
const localePath = useLocalePath()
const route = useRoute()
const id = route.params.id as string
const { can } = useCan()
const roleUrl: string = `/api/roles/${id}`

const role: Ref<RoleDetail | null> = ref(null)
const loadError: Ref<unknown | null> = ref(null)
const loadStatus: Ref<'pending' | 'success' | 'error'> = ref('pending')
usePageResourceError({ identity: () => route.path, errors: [loadError], pending: () => loadStatus.value === 'pending', hasContent: () => Boolean(role.value) })
const refresh = async () => {
  loadStatus.value = 'pending'
  loadError.value = null
  try {
    role.value = await $fetch<RoleDetail, string>(roleUrl)
    loadStatus.value = 'success'
    return true
  } catch (error: unknown) {
    role.value = null
    loadError.value = error
    loadStatus.value = 'error'
    return false
  }
}
queueMicrotask(() => {
  void refresh()
})

/** Retries the role read without returning the internal success flag to the click handler. */
const retryLoad = async () => {
  await refresh()
}

const isUpdateModalOpen: Ref<boolean> = ref(false)
const selectedRole: Ref<Partial<RoleInput> | null> = ref(null)
const isSavingRole: Ref<boolean> = ref(false)

const openUpdateModal = () => {
  if (!role.value || isSavingRole.value) return
  selectedRole.value = {
    ...role.value,
    transfer_payment_ids: role.value.transfer_payment_ids ?? []
  }
  isUpdateModalOpen.value = true
}

const updateRole = async () => {
  if (!selectedRole.value || isSavingRole.value) return

  try {
    isSavingRole.value = true
    const profileKeys = ['name_en', 'name_fr', 'description_en', 'description_fr', 'transfer_payment_ids'] as const
    const profile = Object.fromEntries(profileKeys
      .filter(key => JSON.stringify(selectedRole.value?.[key]) !== JSON.stringify(role.value?.[key]))
      .map(key => [key, selectedRole.value?.[key]]))
    await saveJson(roleUrl, 'PATCH', profile)
    isUpdateModalOpen.value = false
    if (!await refresh()) {
      showError(loadError.value)
      return
    }
    toast.add({
      title: t('common.success'),
      description: t('common.updated_success'),
      color: 'success'
    })
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingRole.value = false
  }
}

/** Applies an allowed ability change and reloads the persisted role. */
const updatePermission = async (subject: RoleAbilitySubject, permission: RolePermissionInput | null) => {
  if (!role.value || isSavingRole.value || isUpdateModalOpen.value) return

  try {
    isSavingRole.value = true
    await saveJson(`${roleUrl}/permissions`, 'PATCH', { subject, permission })
    if (!await refresh()) {
      showError(loadError.value)
    }
  } catch (error: unknown) {
    showError(error)
  } finally {
    isSavingRole.value = false
  }
}

const roleName: ComputedRef<string> = computed(() => getBilingualValue(role.value, 'name'))
const roleDescription: ComputedRef<string> = computed(() => getBilingualValue(role.value, 'description', ''))

const breadcrumbItems = computed(() => [
  { label: t('role.title'), to: localePath(appRouteLocations.roles()) },
  { label: roleName.value }
])

const { getHeroCollapsed } = useDashboard()
const isHeroCollapsed = getHeroCollapsed('role-detail')

const roleScope = computed(() => {
  if (!role.value) return { type: 'global' } as const
  return role.value.agency_id
    ? { type: 'agency', agencyId: String(role.value.agency_id) } as const
    : { type: 'global' } as const
})

const canUpdateRole = computed(() => {
  if (!role.value) return false
  return can('role', 'update', roleScope.value)
})

const allowedSubjects = computed(() => {
  if (!role.value) return []

  const roleScopeType = getRoleScopeType(
    role.value.agency_id ? String(role.value.agency_id) : null,
    role.value.transfer_payment_ids?.length ?? 0
  )
  return ROLE_ABILITY_SUBJECTS.filter(subject => isAbilityAllowedForRoleScope(subject, roleScopeType))
})

const tabMap: TabMap = new Map([
  [
    'general',
    {
      key: 'agency.tabs.general',
      icon: 'i-lucide-info',
      component: RoleDetailGeneralTab,
      getProps: () => (role.value ? { role: role.value } : {})
    }
  ],
  [
    'permissions',
    {
      key: 'role.permissions',
      icon: 'i-lucide-shield-check',
      component: RolePermissionsTab,
      getProps: () => ({
        allowedSubjects: allowedSubjects.value,
        rolePermissions: role.value?.permissions ?? [],
        canUpdateRole: canUpdateRole.value,
        pending: isSavingRole.value,
        getBilingualValue
      })
    }
  ]
])

const { tabs: routeTabs, selectedTab, activeTabComponent, activeTabProps } = useRouteTabMap({
  tabMap,
  defaultTabId: 'general'
})
</script>

<template>
  <CommonLoadingState v-if="loadStatus === 'pending' && !role" :label="t('common.loading')" />

  <UAlert
    v-else-if="loadError || loadStatus === 'error'"
    role="alert"
    aria-live="assertive"
    color="error"
    icon="i-lucide-circle-alert"
    :title="t('common.resource_table_load_failed')"
    :description="t('common.resource_table_load_failed_description')">
    <template #actions>
      <UButton color="error" variant="soft" :label="t('common.retry')" @click="retryLoad" />
    </template>
  </UAlert>

  <CommonDetailPage v-else-if="role" id="role-detail" v-model:collapsed="isHeroCollapsed" :breadcrumb-items="breadcrumbItems">
    <template #body>
      <div class="flex flex-1 flex-col">
        <CommonEntityHero
          :is-collapsed="isHeroCollapsed"
          icon="i-lucide-shield"
          :title="roleName"
          :description="roleDescription"
          :actions="[{
            label: t('common.edit'),
            icon: 'i-lucide-edit-3',
            visible: canUpdateRole,
            onClick: openUpdateModal
          }]" />

        <CommonDetailWorkspace v-model="selectedTab" :items="routeTabs" content-test-id="role-detail-content">
          <component
            :is="activeTabComponent"
            v-if="activeTabComponent"
            v-bind="activeTabProps"
            @change="updatePermission" />
        </CommonDetailWorkspace>
      </div>

      <RoleModal
        v-if="selectedRole"
        v-model:open="isUpdateModalOpen"
        v-model:state="selectedRole"
        :title="t('role.update_title')"
        :submit-label="t('common.update')"
        :pending="isSavingRole"
        editing
        @submit="updateRole" />
    </template>
  </CommonDetailPage>
</template>
