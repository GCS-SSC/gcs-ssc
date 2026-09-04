import { LazyCommonConfirmDialog } from '#components'
import type { ConfirmDialogOptions } from '~~/shared/types/ui'

/**
 * Creates a reusable confirmation dialog launcher.
 *
 * @returns A function that opens the confirm dialog and resolves to user choice.
 */
export const useConfirmDialog = () => {
  const overlay = useOverlay()

  return (options: ConfirmDialogOptions): Promise<boolean> => {
    const modal = overlay.create(LazyCommonConfirmDialog, {
      destroyOnClose: true,
      props: options
    })

    return modal.open()
  }
}
