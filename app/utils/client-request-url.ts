/**
 * Builds an absolute URL for browser fetch calls while keeping composable tests
 * usable in non-window environments.
 *
 * @param path - Relative or absolute request path.
 * @returns URL object suitable for fetch.
 */
export const getClientRequestUrl = (path: string | URL) => {
  if (path instanceof URL) {
    return path
  }

  const origin = typeof window === 'undefined'
    ? 'http://localhost'
    : window.location.origin

  return new URL(path, origin)
}
