/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-returns -- Authorization helpers expose typed contracts while focused tests document behavior. */
import { computed, watch } from 'vue'
import type { Ref } from 'vue'
import type { FetchError } from 'ofetch'
import type { AbilityAction, AuthorizationSubject } from '~~/shared/utils/abilities'
import type { RoleScopeType } from '~~/shared/utils/role-scope'
import type { Scope } from '~~/shared/utils/scopes'
import { isScopeCovered } from '~~/shared/utils/scopes'
import type { StaticPermissionGrant } from '~~/shared/types/auth'
import {
  StaticPermissionGrantSchema,
  StaticPermissionsEnvelopeSchema
} from '~~/shared/types/auth'
import { authClient } from '~~/app/utils/auth-client'

const PERMISSIONS_CACHE_KEY = 'user-permissions'
const PERMISSIONS_FETCH_KEY = 'user-permissions-request'

interface SharedPermissionState {
  userId: string
  grants: StaticPermissionGrant[]
  status: 'idle' | 'pending' | 'resolved'
  generation: number
}

const parsePermissions = (value: unknown): StaticPermissionGrant[] => {
  const parsedEnvelope = StaticPermissionsEnvelopeSchema.safeParse(value)
  if (!parsedEnvelope.success) {
    if (import.meta.dev) {
      console.warn('Malformed permission response ignored', { issues: parsedEnvelope.error.issues })
    }
    return []
  }

  return parsedEnvelope.data.grants.flatMap(permission => {
    const parsedPermission = StaticPermissionGrantSchema.safeParse(permission)
    if (parsedPermission.success) return [parsedPermission.data]

    if (import.meta.dev) {
      console.warn('Malformed permission grant ignored', {
        issues: parsedPermission.error.issues,
        permission
      })
    }
    return []
  })
}

/** Provides authenticated state and client-side hints over canonical static grants. */
export const useAuth = () => {
  const session = authClient.useSession()
  const user = computed(() => session.value.data?.user)
  const userId = computed(() => {
    const id = user.value?.id
    return id === undefined || id === null ? 'anon' : id
  })

  const permissionsEndpoint: string = '/api/auth/permissions'
  const {
    data: fetchedPermissions,
    error: permissionsError,
    refresh: refreshPermissions
  } = useFetch<unknown, FetchError, string>(
    permissionsEndpoint,
    {
      key: PERMISSIONS_FETCH_KEY,
      watch: false,
      immediate: false,
      default: (): unknown => ({ grants: [] })
    }
  )

  const permissionState: Ref<SharedPermissionState> = useState(PERMISSIONS_CACHE_KEY, () => ({
    userId: userId.value,
    grants: [],
    status: 'idle',
    generation: 0
  }))
  const userPermissions = computed(() => permissionState.value.userId === userId.value
    ? permissionState.value.grants
    : [])

  const isCurrentPermissionRequest = (requestedUserId: string, requestedGeneration: number): boolean =>
    userId.value === requestedUserId
    && permissionState.value.userId === requestedUserId
    && permissionState.value.generation === requestedGeneration

  const loadPermissions = async (requestedUserId: string): Promise<void> => {
    if (permissionState.value.userId !== requestedUserId) return
    if (permissionState.value.status !== 'idle') return

    const requestedGeneration = permissionState.value.generation
    permissionState.value = {
      ...permissionState.value,
      status: 'pending'
    }

    try {
      await refreshPermissions()
    } catch {
      if (isCurrentPermissionRequest(requestedUserId, requestedGeneration)) {
        permissionState.value = {
          ...permissionState.value,
          status: 'idle'
        }
      }
      return
    }

    if (!isCurrentPermissionRequest(requestedUserId, requestedGeneration)) return
    if (permissionsError.value !== undefined && permissionsError.value !== null) {
      permissionState.value = {
        ...permissionState.value,
        status: 'idle'
      }
      return
    }

    permissionState.value = {
      userId: requestedUserId,
      grants: parsePermissions(fetchedPermissions.value),
      status: 'resolved',
      generation: requestedGeneration
    }
  }

  const refreshPermissionsForUser = (nextUserId: string): void => {
    if (permissionState.value.userId !== nextUserId) {
      permissionState.value = {
        userId: nextUserId,
        grants: [],
        status: 'idle',
        generation: permissionState.value.generation + 1
      }
    }
    void loadPermissions(nextUserId)
  }

  refreshPermissionsForUser(userId.value)
  watch(userId, refreshPermissionsForUser, { flush: 'sync' })

  const matchesPermissionGrant = <A extends AbilityAction>(
    permission: StaticPermissionGrant,
    subject: AuthorizationSubject,
    action: A,
    scope: Scope
  ): boolean => permission.subject === subject
    && permission.action === action
    && isScopeCovered(permission.scope, scope)

  const authorize = <A extends AbilityAction>(
    subject: AuthorizationSubject,
    action: A,
    scope: Scope
  ): boolean => {
    return userPermissions.value.some(permission =>
      matchesPermissionGrant(permission, subject, action, scope)
    )
  }

  const hasAbility = <A extends AbilityAction>(
    subject: AuthorizationSubject,
    action: A,
    roleScopeTypes?: readonly RoleScopeType[]
  ): boolean => userPermissions.value.some(permission =>
    permission.subject === subject
    && permission.action === action
    && (roleScopeTypes === undefined || roleScopeTypes.includes(permission.scope.type))
  )

  const canManageAssignments = (
    subject: AuthorizationSubject,
    scope?: Scope
  ): boolean => userPermissions.value.some(permission =>
    permission.subject === subject
    && permission.action === 'manage_assignments'
    && (scope === undefined || isScopeCovered(permission.scope, scope))
  )

  return {
    user,
    session,
    authorize,
    hasAbility,
    canManageAssignments,
    can: authorize,
    canAny: hasAbility,
    signOut: () => authClient.signOut()
  }
}
