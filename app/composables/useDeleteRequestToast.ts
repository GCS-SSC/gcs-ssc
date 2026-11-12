import { getCurrentScope, onScopeDispose } from 'vue'
import type { DeleteConfirmationOptions, DeleteTarget } from '~/composables/useConfirmDeleteRequest'
import type { ConfirmDialogOptions } from '~~/shared/types/ui'

type DeleteRequestToastOptions<Row> = Pick<DeleteConfirmationOptions<Row>, 'shouldProceed' | 'operation'> & {
  target: DeleteTarget<Row>
  refresh: () => Promise<void> | void
  confirmOptions?: Partial<ConfirmDialogOptions>
  successTitle?: string
  successDescription?: string
}

/**
 * Creates a delete helper that confirms, refreshes, and reports the result through shared toasts.
 *
 * @returns Delete request toast helper.
 */
export const useDeleteRequestToast = () => {
  let lifetime: 'active' | 'disposed' = 'active'
  if (getCurrentScope()) {
    onScopeDispose(() => {
      lifetime = 'disposed'
    })
  }
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()

  /**
   * Confirms a DELETE request, refreshes the caller data, and shows the standard success toast.
   *
   * @param url - API URL to delete.
   * @param options - Refresh callback and optional confirmation or success-message overrides.
   * @returns True when the delete was confirmed and completed; false for cancellation or handled errors.
   */
  const confirmDeleteWithToast = async <Row>(url: string, options: DeleteRequestToastOptions<Row>): Promise<boolean> => {
    const shouldProceed = () => lifetime === 'active' && (!options.shouldProceed || options.shouldProceed())
    const isCurrent = () => lifetime === 'active'
      && Boolean(options.operation?.isCurrent())
    if (!shouldProceed() || !options.operation?.canDispatch()) return false
    try {
      const confirmationOptions = {
        ...options.confirmOptions, shouldProceed, operation: options.operation, target: options.target
      }
      const ok = await confirmDeleteRequest(url, confirmationOptions)
      if (!ok || !isCurrent()) {
        return false
      }

      await options.refresh()
      if (!isCurrent()) return false
      toast.add({
        title: options.successTitle ?? toast.localized('common.success'),
        description: options.successDescription ?? toast.localized('common.deleted_success'),
        color: 'success'
      })

      return true
    } catch (error: unknown) {
      if (isCurrent()) showError(error)
      return false
    }
  }

  return { confirmDeleteWithToast }
}
