import { authClient } from '~~/app/utils/auth-client'
import { resolveAuthReturnTarget } from '~/utils/auth-return-target'
import { appRouteLocations } from '~/utils/route-locations'

export default defineNuxtRouteMiddleware(async (to) => {
  const localePath = useLocalePath()
  const loginPath = localePath(appRouteLocations.login())
  const homePath = localePath(appRouteLocations.home())

  const isLoginRoute = to.path === loginPath
  let isAuthenticated = false
  try {
    const { data } = await authClient.getSession({
      query: { disableCookieCache: true }
    })
    isAuthenticated = !!data?.user
  } catch {
    isAuthenticated = false
  }

  if (!isAuthenticated && !isLoginRoute) {
    const returnTo = typeof to.fullPath === 'string' && to.fullPath.startsWith('/')
      ? to.fullPath
      : to.path
    return navigateTo({ path: loginPath, query: { returnTo } })
  }

  if (isAuthenticated && isLoginRoute) {
    return navigateTo(resolveAuthReturnTarget(
      to.query.returnTo,
      homePath,
      ['/login', '/connexion', loginPath]
    ))
  }
})
