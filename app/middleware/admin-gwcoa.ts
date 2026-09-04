import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import {
  StaticPermissionGrantSchema,
  StaticPermissionsEnvelopeSchema
} from '~~/shared/types/auth'
import { appRouteLocations } from '~/utils/route-locations'

export default defineNuxtRouteMiddleware(async () => {
  const localePath = useLocalePath()
  const homePath = localePath(appRouteLocations.home())

  try {
    const response = await fetch(getClientRequestUrl('/api/auth/permissions'))
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    const parsedPermissions = StaticPermissionsEnvelopeSchema.safeParse(await response.json())
    const hasSystemRead = parsedPermissions.success && parsedPermissions.data.grants.some(permission => {
      const parsedPermission = StaticPermissionGrantSchema.safeParse(permission)
      return parsedPermission.success
        && parsedPermission.data.subject === 'system'
        && parsedPermission.data.action === 'read'
        && parsedPermission.data.scope.type === 'global'
    })

    if (!hasSystemRead) {
      return navigateTo(homePath)
    }
  } catch (error) {
    console.error('Failed to check admin permissions:', error)
    return navigateTo(homePath)
  }
})
