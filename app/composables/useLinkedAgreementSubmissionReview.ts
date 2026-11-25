import { computed, ref, shallowRef, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import type { AgreementSubmissionDetail, AgreementSubmissionList, LinkedSubmissionOverviewReview } from '~~/shared/types/agreement-submission'
import { allowsLinkedSubmissionAction } from '~~/shared/utils/agreement-linked-submission-policy'
import { useResourceRequest } from './useResourceRequest'
import { useActionContext } from './useActionContext'
import type { CapturedActionContext } from './useActionContext'

type ReviewCommand = { action: 'start' | 'accept' } | { action: 'return', description: string, opening: CapturedActionContext }
type ReviewAction = ReviewCommand['action']

/**
 * Loads and settles review actions for a single native Agreement editor.
 * @param agreementId - Owning Agreement.
 * @param target - Financial record type.
 * @param targetId - Native financial record ID.
 * @param native - Read and refresh the overview owned by the native editor.
 * @param native.read - Linked review evidence from the financial snapshot.
 * @param native.status - Status of the financial overview request.
 * @param native.refresh - Refreshes the native values on the current page.
 * @param native.canReviewRole - Whether the actor has update permission at the owning scope.
 * @param native.isAssigned - Whether the actor is assigned to the exact financial record.
 * @returns Review evidence, native editing admission, and review actions.
 */
export const useLinkedAgreementSubmissionReview = (agreementId: string, target: 'claim' | 'forecast', targetId: string, native: {
  read: () => LinkedSubmissionOverviewReview | null | undefined
  status: () => 'idle' | 'pending' | 'success' | 'error'
  refresh: () => Promise<unknown>
  canReviewRole: () => boolean
  isAssigned: () => boolean
}) => {
  const { user, permissionRevision } = useAuth()
  const { showError } = useApiErrorToast()
  const toast = useLocalizedToast()
  const fetchJson: $Fetch = $fetch as $Fetch
  const identity = computed(() => JSON.stringify([agreementId, target, targetId, user.value?.id, permissionRevision.value]))
  const base = `/api/agreements/${agreementId}/submissions`
  const resource = useResourceRequest<AgreementSubmissionDetail | false>({
    identity,
    enabled: () => Boolean(user.value),
    /**
     * Loads evidence linked to the financial record.
     * @param signal - Cancellation signal for the native editor read.
     * @returns Linked review detail or false for a native record without a submission.
     */
    load: async signal => {
      const { items } = await fetchJson<AgreementSubmissionList>(base, { query: { target, targetId }, signal })
      const submission = items[0]
      return submission ? await fetchJson<AgreementSubmissionDetail>(`${base}/${submission.id}`, { signal }) : false
    }
  })
  const committed = shallowRef<AgreementSubmissionDetail | null>(null)
  const operation = ref<'idle' | 'refreshing' | 'command'>('idle')
  const pending = computed(() => operation.value === 'command')
  const reloading = computed(() => operation.value === 'refreshing' || resource.status.value === 'pending')
  const commandError = ref<'failed' | 'stale' | null>(null)
  watch(identity, () => {
    committed.value = null
    commandError.value = null
  }, { flush: 'sync' })
  const detail = computed(() => committed.value ?? (resource.data.value || null))
  const state = computed(() => detail.value?.submission.egcs_fc_state)
  const nativeReview = computed(native.read)
  const mismatched = computed(() => {
    const overview = nativeReview.value
    if (resource.status.value !== 'success' || overview === undefined) return false
    return (overview?.submissionId ?? null) !== (detail.value?.submission.id ?? null)
      || (overview?.revision ?? null) !== (detail.value?.submission.egcs_fc_revision ?? null)
  })
  const stale = computed(() => mismatched.value || commandError.value === 'stale')
  const failed = computed(() => commandError.value === 'failed')
  const warning = computed(() => {
    if (resource.error.value) return 'submission.detail_failed'
    if (stale.value) return 'submission.errors.financial_stale'
    if (failed.value) return 'submission.action_failed'
    if (native.status() === 'error') return 'common.resource_table_load_failed'
    if (operation.value !== 'idle' || resource.status.value !== 'success' || native.status() !== 'success') return 'common.loading_records'
    return null
  })
  const reviewReady = computed(() => operation.value === 'idle' && nativeReview.value !== undefined
    && resource.status.value === 'success' && !stale.value && !failed.value)
  const actionReady = computed(() => reviewReady.value && native.status() === 'success')
  const canReviewRole = computed(native.canReviewRole)
  const canEdit = computed(() => reviewReady.value && allowsLinkedSubmissionAction(state.value ?? null, 'edit'))
  const canAdvanceLifecycle = computed(() => actionReady.value && allowsLinkedSubmissionAction(state.value ?? null, 'lifecycle'))
  const commandContext = useActionContext({
    identity: [() => detail.value?.submission.id],
    authority: () => detail.value?.canReview === true
  })
  const returnDecisionDigest = ref<string | null>(null)
  watch([native.status, native.read], ([status, overview]) => {
    if (status === 'success') returnDecisionDigest.value = overview?.decisionDigest ?? null
  }, { immediate: true, flush: 'sync' })
  const returnContext = useActionContext({
    identity: [
      () => detail.value?.submission.id,
      () => detail.value?.submission.egcs_fc_revision,
      state,
      returnDecisionDigest
    ],
    authority: () => detail.value?.canReturn === true
  })

  /**
   * Checks the visible action's prerequisites before opening an editor or sending a command.
   * @param action - The selected review action.
   * @returns Whether the current actor may proceed.
   */
  const canActivate = (action: ReviewAction) => {
    if (!detail.value || !canReviewRole.value || !actionReady.value) return false
    const warning = !native.isAssigned()
      ? 'assignments.read_only_description'
      : action === 'return' && !detail.value.returnAllowed ? 'submission.errors.return_disabled' : undefined
    if (warning) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized(warning), color: 'warning' })
      return false
    }
    return action === 'return' ? detail.value.canReturn : detail.value.canReview
  }

  const returnOpening = shallowRef<CapturedActionContext | null>(null)
  const returnText = ref('')
  const returnError = ref(false)
  const returnOpen = computed(() => returnOpening.value !== null)

  /** Discards the current inline return draft. */
  const closeReturn = () => {
    returnOpening.value = null
    returnText.value = ''
    returnError.value = false
  }
  watch(returnContext.version, closeReturn, { flush: 'sync' })

  /** Opens a fresh inline return draft after prerequisites are checked. */
  const openReturn = () => {
    if (returnOpening.value || !canActivate('return') || state.value !== 'reviewing' || !returnDecisionDigest.value) return
    const owner = returnContext.capture()
    if (!owner) return
    const opening = {
      isCurrent: () => returnOpening.value === opening && owner.isCurrent(),
      canDispatch: () => returnOpening.value === opening && owner.canDispatch()
    }
    returnOpening.value = opening
  }

  /** @returns Whether a fresh read established the review state. */
  const refresh = async () => {
    if (operation.value !== 'idle') return false
    const capturedIdentity = identity.value
    operation.value = 'refreshing'
    try {
      const loaded = await resource.refresh()
      if (identity.value !== capturedIdentity || resource.state.value.kind === 'disposed') return false
      if (loaded) committed.value = null
      await native.refresh()
      if (!loaded || identity.value !== capturedIdentity || native.status() !== 'success' || mismatched.value) return false
      commandError.value = null
      return true
    } finally {
      operation.value = 'idle'
    }
  }

  /**
   * Applies one review decision against the loaded revision.
   * @param command - Review action and its required evidence.
   * @returns Whether the currently selected review adopted the result.
   */
  const run = async (command: ReviewCommand) => {
    if (command.action === 'return' && !command.opening.canDispatch()) return false
    if (!canActivate(command.action)) return false
    const current = detail.value
    const owner = commandContext.capture()
    if (!current || !owner?.canDispatch() || !actionReady.value) return false
    const proof = nativeReview.value?.decisionDigest
    if (command.action !== 'start' && !proof) return false
    operation.value = 'command'
    let acknowledged = false
    try {
      const response = await fetchJson<AgreementSubmissionDetail>(`${base}/${current.submission.id}`, {
        method: 'POST',
        body: {
          action: command.action,
          ...(command.action === 'return' ? { description: command.description } : {}),
          revision: current.submission.egcs_fc_revision,
          ...(command.action !== 'start' ? { expectedDecisionDigest: proof } : {})
        }
      })
      acknowledged = true
      if (!owner.isCurrent()) return false
      committed.value = response
      await native.refresh()
      return owner.isCurrent()
    } catch (error) {
      if (owner.isCurrent()) {
        if (acknowledged) return true
        const payload = error && typeof error === 'object' && 'data' in error ? error.data : undefined
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : undefined
        const code = data && typeof data === 'object' && 'code' in data ? data.code : undefined
        if (code === 'SUBMISSION_FINANCIAL_STALE' || code === 'SUBMISSION_STALE') commandError.value = 'stale'
        else if (!(typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400)) commandError.value = 'failed'
        showError(error)
      }
      return false
    } finally {
      operation.value = 'idle'
    }
  }

  /** @returns Whether the open return completed and was adopted by the linked review. */
  const confirmReturn = async () => {
    const opening = returnOpening.value
    if (!opening?.canDispatch()) return false
    const description = returnText.value.trim()
    if (!description) {
      returnError.value = true
      return false
    }
    return await run({ action: 'return', description, opening })
  }

  return {
    detail, state, actionReady, canReviewRole, canEdit, canAdvanceLifecycle, pending, reloading, failed, stale, warning,
    status: resource.status, error: resource.error, refresh, run,
    returnOpen, returnText, returnError, openReturn, closeReturn, confirmReturn
  }
}
