import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { ConfirmDialogOptions } from '~~/shared/types/ui'

/**
 * Creates a helper that confirms and executes DELETE requests.
 *
 * @remarks
 * The request is sent only when the confirmation dialog resolves to `true`.
 *
 * @returns Delete request helper.
 *
 * @example
 * ```typescript
 * const { confirmDeleteRequest } = useConfirmDeleteRequest()
 * await confirmDeleteRequest('/api/resource/1')
 * ```
 */
export const useConfirmDeleteRequest = () => {
  const confirmDelete = useDeleteConfirm()

  /**
   * Confirms and executes a DELETE request to a specific URL.
   *
   * @param url - The URL to send the DELETE request to.
   * @param options - Optional configuration for the confirmation dialog.
   * @returns Promise resolving to true if the deletion was confirmed and completed, false otherwise.
   */
  const confirmDeleteRequest: (url: string, options?: Partial<ConfirmDialogOptions>) => Promise<boolean> = async (
    url,
    options = {}
  ) => {
    const confirmed = await confirmDelete(options)
    if (!confirmed) return false
    const response = await fetch(getClientRequestUrl(url), { method: 'DELETE' })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }
    return true
  }

  return { confirmDeleteRequest }
}
