import type { ConfirmDialogOptions } from '~~/shared/types/ui'

/**
 * Creates a preconfigured destructive-action confirmation dialog helper.
 *
 * @remarks
 * Default labels are localized and `confirmColor` defaults to `error`.
 *
 * @returns A function that opens the confirmation dialog.
 *
 * @example
 * ```typescript
 * const confirmDelete = useDeleteConfirm()
 * const confirmed = await confirmDelete()
 * ```
 */
export const useDeleteConfirm = () => {
  const confirm = useConfirmDialog()
  const { t } = useI18n()

  return (options: Partial<ConfirmDialogOptions> = {}) => confirm({
    title: options.title ?? t('common.delete_confirm_title'),
    description: options.description ?? t('common.delete'),
    confirmLabel: options.confirmLabel ?? t('common.delete'),
    cancelLabel: options.cancelLabel ?? t('common.cancel'),
    confirmColor: options.confirmColor ?? 'error'
  })
}
