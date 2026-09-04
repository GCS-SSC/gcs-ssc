<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local callbacks are clear from their names and types */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
/* eslint-disable @stylistic/comma-dangle -- generic Vue arrows need parser-disambiguating commas */
import { ref, computed, watch } from 'vue'
import type { Ref } from 'vue'
import { UserRoleAssignmentSchema, type UserRoleAssignment } from '~~/shared/types/schemas/rbac'
import { refDebounced } from '@vueuse/core'
import type {
  ListResponse,
  RoleOptionItem,
  UserOptionItem,
  UserRoleAssignmentAccess
} from '~~/shared/types/admin'
import { canAssignUserRole } from '~~/shared/utils/user-role-assignment-access'

const {
  title,
  submitLabel,
  hideUser = false,
  submitDisabled = false,
  pending = false,
  roleAssignmentAccess
} = defineProps<{
  title: string
  submitLabel: string
  hideUser?: boolean
  submitDisabled?: boolean
  pending?: boolean
  roleAssignmentAccess: UserRoleAssignmentAccess
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<UserRoleAssignment>>('state', { required: true })

const emit = defineEmits<{
  submit: [role: RoleOptionItem]
}>()

const i18n = useI18n()
const { t } = i18n
const { createValidator } = useZodI18n()
const validate = createValidator(UserRoleAssignmentSchema)

const getLocaleMessages = (locale: 'en' | 'fr'): Record<string, unknown> => {
  if (typeof i18n.getLocaleMessage !== 'function') {
    return {}
  }

  const rawMessages = i18n.getLocaleMessage(locale)
  if (typeof rawMessages !== 'object' || rawMessages == null) {
    return {}
  }

  return rawMessages as Record<string, unknown>
}

const userSearchTerm = ref('')
const roleSearchTerm = ref('')
const roleRequiredError: Ref<boolean> = ref(false)
const roleAuthorizationError: Ref<boolean> = ref(false)
const debouncedUserSearchTerm = refDebounced(userSearchTerm, 250)
const debouncedRoleSearchTerm = refDebounced(roleSearchTerm, 250)
const usersResponse: Ref<ListResponse<UserOptionItem> | null> = ref(null)
const rolesResponse: Ref<ListResponse<RoleOptionItem> | null> = ref(null)
const selectedRole: Ref<RoleOptionItem | null> = ref(null)
let roleRequestId = 0
let userRequestId = 0

const fetchList = async <T,>(url: string, search: string) => {
  const requestUrl = getClientRequestUrl(url)
  requestUrl.searchParams.set('page', '1')
  requestUrl.searchParams.set('limit', '20')
  if (search) {
    requestUrl.searchParams.set('search', search)
  }
  const response = await fetch(requestUrl)
  if (!response.ok) {
    await throwFetchResponseError(response)
  }
  return await response.json() as ListResponse<T>
}

const refreshUsers = async () => {
  const requestId = ++userRequestId
  const search = debouncedUserSearchTerm.value
  const response = await fetchList<UserOptionItem>('/api/users', search)
  if (requestId === userRequestId && open.value && debouncedUserSearchTerm.value === search) {
    usersResponse.value = response
  }
}

const refreshRoles = async () => {
  const requestId = ++roleRequestId
  const userId = state.value.user_id
  if (!userId) {
    rolesResponse.value = { items: [], total: 0, page: 1, limit: 20 }
    return
  }
  const search = debouncedRoleSearchTerm.value
  const response = await fetchList<RoleOptionItem>(
    `/api/users/${userId}/assignable-roles`,
    search
  )
  if (
    requestId === roleRequestId
    && open.value
    && state.value.user_id === userId
    && debouncedRoleSearchTerm.value === search
  ) {
    rolesResponse.value = response
  }
}

watch([debouncedUserSearchTerm, open], async ([, isOpen]) => {
  if (!isOpen) {
    userRequestId += 1
    usersResponse.value = null
    return
  }
  await refreshUsers()
}, { immediate: true })

watch([debouncedRoleSearchTerm, () => state.value.user_id, open], async ([, userId, isOpen], previousValues) => {
  const previousUserId = previousValues?.[1]
  if (previousUserId !== undefined && userId !== previousUserId) {
    state.value.role_id = undefined
    selectedRole.value = null
    rolesResponse.value = null
  }
  if (!isOpen) {
    roleRequestId += 1
    rolesResponse.value = null
    return
  }
  await refreshRoles()
}, { immediate: true })

const getRoleLocaleLabel = (locale: 'en' | 'fr', path: Array<string>, fallback: string): string => {
  const root = getLocaleMessages(locale)
  if (typeof root !== 'object' || root == null) {
    return fallback
  }

  let current: unknown = root
  for (const key of path) {
    if (typeof current !== 'object' || current == null || !(key in current)) {
      return fallback
    }
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' && current.length > 0 ? current : fallback
}

const canAssignRole = (role: RoleOptionItem): boolean => {
  return canAssignUserRole(role, roleAssignmentAccess)
}

/** Builds labels with scope context for otherwise duplicate role names. */
const roleItems = computed<RoleOptionItem[]>(() => {
  const globalEn = getRoleLocaleLabel('en', ['role', 'scope', 'global'], 'Global')
  const globalFr = getRoleLocaleLabel('fr', ['role', 'scope', 'global'], 'Global')
  const agencyEn = getRoleLocaleLabel('en', ['role', 'scope', 'agency'], 'Agency')
  const agencyFr = getRoleLocaleLabel('fr', ['role', 'scope', 'agency'], 'Agence')
  const programEn = getRoleLocaleLabel('en', ['role', 'assignment', 'program'], 'Program')
  const programFr = getRoleLocaleLabel('fr', ['role', 'assignment', 'program'], 'Programme')

  return (rolesResponse.value?.items ?? []).filter(canAssignRole).map((role: RoleOptionItem) => {
    const agencySuffixEn = role.agency_name_en ?? (role.agency_id ? `${agencyEn} ${role.agency_id}` : globalEn)
    const agencySuffixFr = role.agency_name_fr ?? (role.agency_id ? `${agencyFr} ${role.agency_id}` : globalFr)
    const programSuffixEn = role.scope_type === 'program' ? ` - ${programEn}` : ''
    const programSuffixFr = role.scope_type === 'program' ? ` - ${programFr}` : ''

    return {
      ...role,
      name_en: `${role.name_en} (${agencySuffixEn})${programSuffixEn}`,
      name_fr: `${role.name_fr} (${agencySuffixFr})${programSuffixFr}`
    }
  })
})

watch(
  () => state.value.role_id,
  roleId => {
    if (roleId) {
      const matchingRole = roleItems.value.find(role => String(role.id) === String(roleId))
      if (matchingRole) selectedRole.value = matchingRole
      roleRequiredError.value = false
      roleAuthorizationError.value = false
    } else {
      selectedRole.value = null
    }
  }
)

watch(
  () => open.value,
  isOpen => {
    if (isOpen) {
      roleRequiredError.value = false
      roleAuthorizationError.value = false
    } else {
      selectedRole.value = null
    }
  }
)

const onSubmit = () => {
  if (!state.value.role_id) {
    roleRequiredError.value = true
    return
  }

  const role = selectedRole.value
    ?? roleItems.value.find(item => String(item.id) === String(state.value.role_id))
  if (!role || String(role.id) !== String(state.value.role_id) || !canAssignRole(role)) {
    roleAuthorizationError.value = true
    return
  }

  emit('submit', role)
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField v-if="!hideUser" :label="t('role.assignment.user')" name="user_id">
          <CommonBilingualSelectMenu
            v-model="state.user_id"
            :items="usersResponse?.items"
            :search-term="userSearchTerm"
            value-key="id"
            label-key="name"
            searchable
            @update:search-term="userSearchTerm = $event" />
        </UFormField>
        <UFormField :label="t('role.assignment.role')" name="role_id">
          <CommonBilingualSelectMenu
            v-model="state.role_id"
            :items="roleItems"
            :search-term="roleSearchTerm"
            value-key="id"
            label-en-key="name_en"
            label-fr-key="name_fr"
            searchable
            @update:search-term="roleSearchTerm = $event" />
          <p v-if="roleRequiredError" class="text-error mt-1 text-sm">
            {{ t('validation.required') }}
          </p>
          <p v-else-if="roleAuthorizationError" class="text-error mt-1 text-sm">
            {{ t('role.assignment.not_authorized') }}
          </p>
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="submitDisabled || pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
