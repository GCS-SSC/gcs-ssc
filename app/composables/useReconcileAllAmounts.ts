type ReconcileAllResult =
  | { kind: 'saved'; changedCount: number }
  | { kind: 'confirmation-required'; overwriteCount: number; confirmation: string }

/**
 * Requests confirmation only when the locked server calculation would replace saved amounts.
 * @returns A bulk reconciliation action bound to the caller's current identity.
 */
export const useReconcileAllAmounts = () => {
  const { t } = useI18n()

  return async (id: string, isCurrent: () => boolean): Promise<boolean> => {
    const route = `/api/claim-reconciliations/${id}/lines/reconcile-all` as const
    let confirmation: string | null = null

    while (isCurrent()) {
      const result: ReconcileAllResult = await $fetch<ReconcileAllResult, typeof route>(route, {
        method: 'POST',
        body: { confirmation }
      })
      if (result.kind === 'saved') return true
      if (!isCurrent() || !window.confirm(t('agreement.claims.reconcile_all_overwrite', result.overwriteCount))) return false
      confirmation = result.confirmation
    }
    return false
  }
}
