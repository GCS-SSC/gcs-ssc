/* eslint-disable jsdoc/require-jsdoc -- local callbacks implement the documented confirmation lifetime. */
import { getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue'
import type { CapturedActionContext } from '~/composables/useActionContext'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { ConfirmDialogOptions } from '~~/shared/types/ui'

export type DeleteOperationOptions = { operation: CapturedActionContext | null }

export type DeleteTarget<Row> = {
  id: string
  resolve: () => Row | null | undefined
  eligible: (row: Row) => boolean
}

export type DeleteConfirmationOptions<Row> = Partial<ConfirmDialogOptions> & DeleteOperationOptions & {
  target: DeleteTarget<Row>
  shouldProceed?: () => boolean
  confirm?: () => Promise<boolean | undefined>
}

/**
 * Creates a helper that confirms and executes DELETE requests.
 *
 * @remarks
 * Dispatch requires the captured operation and a per-request latched eligibility guard.
 * Captured context owns settlement after its own row is deleted.
 *
 * @returns Delete request helper.
 *
 * @example
 * ```typescript
 * const { confirmDeleteRequest } = useConfirmDeleteRequest()
 * await confirmDeleteRequest('/api/resource/1', { operation, target })
 * ```
 */
export const useConfirmDeleteRequest = () => {
  const confirmDelete = useDeleteConfirm()
  let lifetime: 'active' | 'disposed' = 'active'
  type PendingDelete = { token: object; operation: CapturedActionContext; dispatched: boolean }
  const pendingTargets = shallowRef(new Map<string, PendingDelete>())
  const targetKey = (url: string, id: string) => `${url}\u0000${id}`
  const isDeletePending = (url: string, id: string) => {
    const pending = pendingTargets.value.get(targetKey(url, id))
    return Boolean(pending && (pending.dispatched || pending.operation.isCurrent()))
  }
  const guardCleanups = new Set<() => void>()
  if (getCurrentScope()) {
    onScopeDispose(() => {
      lifetime = 'disposed'
      for (const cleanup of guardCleanups) cleanup()
    })
  }

  /**
   * Confirms and executes a DELETE request to a specific URL.
   *
   * @param url - The URL to send the DELETE request to.
   * @param options - Optional configuration for the confirmation dialog.
   * @returns Promise resolving to true if the deletion was confirmed and completed, false otherwise.
   */
  const confirmDeleteRequest = async <Row>(url: string, options: DeleteConfirmationOptions<Row>): Promise<boolean> => {
    const { shouldProceed, confirm, operation, target, ...dialogOptions } = options
    if (lifetime !== 'active' || !operation?.canDispatch()) return false
    const key = targetKey(url, target.id)
    const previous = pendingTargets.value.get(key)
    if (previous && (previous.dispatched || previous.operation.isCurrent())) return false
    const pending: PendingDelete = { token: {}, operation, dispatched: false }
    pendingTargets.value = new Map(pendingTargets.value).set(key, pending)
    const resolve = target.resolve
    const targetEligible = target.eligible
    const hasTarget = () => {
      const row = resolve()
      return row != null && targetEligible(row)
    }
    let eligible = true
    const admission = () => hasTarget() && (!shouldProceed || shouldProceed())
    const stopGuard = watch(admission, value => {
      if (!value) eligible = false
    }, { flush: 'sync', immediate: true })
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      stopGuard?.()
      guardCleanups.delete(cleanup)
      if (pendingTargets.value.get(key) === pending) {
        const remaining = new Map(pendingTargets.value)
        remaining.delete(key)
        pendingTargets.value = remaining
      }
    }
    guardCleanups.add(cleanup)
    const hasAdmission = () => {
      if (!admission()) eligible = false
      return eligible
    }
    const canDispatch = () => lifetime === 'active'
      && operation.canDispatch()
      && hasAdmission()
    // An admitted DELETE may remove its own row; only the captured context owns settlement.
    const isCurrent = () => lifetime === 'active'
      && operation.isCurrent()
    let dispatched = false
    try {
      if (!canDispatch()) return false
      const customConfirmation = confirm ? await confirm() : undefined
      if (!canDispatch()) return false
      const confirmed = customConfirmation ?? await confirmDelete(dialogOptions)
      if (!confirmed || !canDispatch()) return false
      dispatched = true
      pending.dispatched = true
      const response = await fetch(getClientRequestUrl(url), { method: 'DELETE' })
      if (!isCurrent()) return false
      if (!response.ok) {
        await throwFetchResponseError(response)
      }
      return isCurrent()
    } catch (error: unknown) {
      if (!(dispatched ? isCurrent() : canDispatch())) return false
      throw error
    } finally {
      cleanup()
    }
  }

  return { confirmDeleteRequest, isDeletePending }
}
