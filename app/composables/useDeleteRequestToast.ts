import type { ConfirmDialogOptions } from '~~/shared/types/ui'

type DeleteRequestToastOptions = {
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
  const { t } = useI18n()
  const toast = useToast()
  const { showError } = useApiErrorToast()
  const { confirmDeleteRequest } = useConfirmDeleteRequest()

  /**
   * Confirms a DELETE request, refreshes the caller data, and shows the standard success toast.
   *
   * @param url - API URL to delete.
   * @param options - Refresh callback and optional confirmation or success-message overrides.
   * @returns True when the delete was confirmed and completed; false for cancellation or handled errors.
   */
  const confirmDeleteWithToast = async (url: string, options: DeleteRequestToastOptions): Promise<boolean> => {
    try {
      const ok = options.confirmOptions
        ? await confirmDeleteRequest(url, options.confirmOptions)
        : await confirmDeleteRequest(url)
      if (!ok) {
        return false
      }

      await options.refresh()
      toast.add({
        title: options.successTitle ?? t('common.success'),
        description: options.successDescription ?? t('common.deleted_success'),
        color: 'success'
      })

      return true
    } catch (error: unknown) {
      showError(error)
      return false
    }
  }

  return { confirmDeleteWithToast }
}
