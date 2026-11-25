import { computed, ref, shallowRef, watch } from 'vue'
import type { $Fetch } from 'ofetch'
import type { AgreementSubmissionDetail, AgreementSubmissionList, LinkedSubmissionOverviewReview } from '~~/shared/types/agreement-submission'
import { allowsLinkedSubmissionAction } from '~~/shared/utils/agreement-linked-submission-policy'
import { agreementSubmissionReviewTransitions } from '~~/shared/utils/agreement-submission-transitions'
import { useResourceRequest } from './useResourceRequest'
import { useActionContext } from './useActionContext'
import { useSubmissionReturn } from './useSubmissionReturn'

type ReviewCommand = { action: 'start' | 'accept' | 'withdraw_return' } | { action: 'return'; description: string }
type ReviewAction = ReviewCommand['action']
type LinkedEvidence = { kind: 'unlinked' } | { kind: 'linked'; detail: AgreementSubmissionDetail }
type ReviewOperation =
  | { kind: 'idle' }
  | { kind: 'refreshing' }
  | { kind: 'submitting' }
  | { kind: 'reading-committed' }
type ReviewRecovery =
  | { kind: 'ready' }
  | { kind: 'stale'; error: unknown }
  | { kind: 'write-failed'; error: unknown }
  | { kind: 'readback-failed'; error?: unknown }

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
  const resource = useResourceRequest<LinkedEvidence>({
    identity,
    enabled: () => Boolean(user.value),
    /**
     * Loads evidence linked to the financial record.
     * @param signal - Cancellation signal for the native editor read.
     * @returns Linked review detail or an explicit unlinked result.
     */
    load: async signal => {
      const { items } = await fetchJson<AgreementSubmissionList>(base, { query: { target, targetId }, signal })
      const submission = items[0]
      return submission
        ? { kind: 'linked', detail: await fetchJson<AgreementSubmissionDetail>(`${base}/${submission.id}`, { signal }) }
        : { kind: 'unlinked' }
    }
  })
  const committed = shallowRef<AgreementSubmissionDetail | null>(null)
  const operation = shallowRef<ReviewOperation>({ kind: 'idle' })
  const pending = computed(() => operation.value.kind === 'submitting' || operation.value.kind === 'reading-committed')
  const reloading = computed(() => operation.value.kind === 'refreshing' || resource.status.value === 'pending')
  const recovery = shallowRef<ReviewRecovery>({ kind: 'ready' })
  watch(identity, () => {
    committed.value = null
    recovery.value = { kind: 'ready' }
  }, { flush: 'sync' })
  const detail = computed(() => committed.value ?? (resource.data.value?.kind === 'linked' ? resource.data.value.detail : null))
  const state = computed(() => detail.value?.submission.egcs_fc_state)
  const nativeReview = computed(native.read)
  const mismatched = computed(() => {
    const overview = nativeReview.value
    if (resource.status.value !== 'success' || overview === undefined) return false
    return (overview?.submissionId ?? null) !== (detail.value?.submission.id ?? null)
      || (overview?.revision ?? null) !== (detail.value?.submission.egcs_fc_revision ?? null)
  })
  const stale = computed(() => mismatched.value || recovery.value.kind === 'stale')
  const failed = computed(() => recovery.value.kind === 'write-failed'
    || (recovery.value.kind === 'readback-failed' && native.status() !== 'error'))
  const latestReceived = computed(() => {
    const current = detail.value?.submission
    if (current?.egcs_fc_state !== 'reviewing' || stale.value || native.status() !== 'success'
      || nativeReview.value?.submissionId !== current.id || nativeReview.value.revision !== current.egcs_fc_revision) return undefined
    return detail.value?.events.findLast(event => event.egcs_fc_kind === 'received'
      && event.egcs_fc_sourcerevision === current.egcs_fc_sourcerevision)
  })
  const sectionComments = computed(() => {
    const current = detail.value
    const comments: Record<string, string> = {}
    if (!current || stale.value) return comments
    for (const entry of current.events) {
      if (entry.egcs_fc_kind !== 'edited' || entry.egcs_fc_sourcerevision !== current.submission.egcs_fc_sourcerevision
        || !entry.egcs_fc_editsection || !entry.egcs_fc_description) continue
      comments[entry.egcs_fc_editsection.id ?? 'unsectioned'] = entry.egcs_fc_description
    }
    return comments
  })
  const warning = computed(() => {
    if (resource.error.value) return 'submission.detail_failed'
    if (stale.value) return 'submission.errors.financial_stale'
    if (recovery.value.kind === 'write-failed') return 'submission.action_failed'
    if (native.status() === 'error' || recovery.value.kind === 'readback-failed') return 'common.resource_table_load_failed'
    if (operation.value.kind !== 'idle' || resource.status.value !== 'success' || native.status() !== 'success') return 'common.loading_records'
    return null
  })
  const reviewReady = computed(() => operation.value.kind === 'idle' && nativeReview.value !== undefined
    && resource.status.value === 'success' && !stale.value && recovery.value.kind === 'ready')
  const actionReady = computed(() => reviewReady.value && native.status() === 'success')
  const canReviewRole = computed(native.canReviewRole)
  const canEdit = computed(() => reviewReady.value && allowsLinkedSubmissionAction(state.value ?? null, 'edit'))
  const canAdvanceLifecycle = computed(() => actionReady.value && allowsLinkedSubmissionAction(state.value ?? null, 'lifecycle'))
  const nativeContext = useActionContext({ identity: [identity], authority: () => Boolean(user.value) })
  const commandContext = useActionContext({
    identity: [() => detail.value?.submission.id],
    authority: () => canReviewRole.value && detail.value?.canReview === true
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
    authority: () => canReviewRole.value && detail.value?.canReturn === true
  })
  const returnEditor = useSubmissionReturn({ context: returnContext, eligible: actionReady })

  /**
   * Checks the visible action's prerequisites before opening an editor or sending a command.
   * @param action - The selected review action.
   * @returns Whether the current actor may proceed.
   */
  const canActivate = (action: ReviewAction) => {
    if (!detail.value || !canReviewRole.value || !actionReady.value) return false
    if (state.value !== agreementSubmissionReviewTransitions[action].from) return false
    const warning = !native.isAssigned()
      ? 'assignments.read_only_description'
      : action === 'return' && !detail.value.returnAllowed ? 'submission.errors.return_disabled' : undefined
    if (warning) {
      toast.add({ title: toast.localized('common.warning'), description: toast.localized(warning), color: 'warning' })
      return false
    }
    return action === 'return' ? detail.value.canReturn : detail.value.canReview
  }

  /** Opens a fresh return dialog draft after prerequisites are checked. */
  const openReturn = () => {
    if (canActivate('return') && returnDecisionDigest.value) returnEditor.open()
  }

  /** @returns Whether a fresh read established the review state. */
  const refresh = async () => {
    if (operation.value.kind !== 'idle') return false
    const owner = nativeContext.capture()
    if (!owner?.canDispatch()) return false
    operation.value = { kind: 'refreshing' }
    try {
      const loaded = await resource.refresh()
      if (!owner.isCurrent()) return false
      if (loaded) committed.value = null
      await native.refresh()
      if (!loaded || !owner.isCurrent() || native.status() !== 'success' || mismatched.value) return false
      recovery.value = { kind: 'ready' }
      return true
    } catch (error) {
      if (owner.isCurrent()) recovery.value = { kind: 'readback-failed', error }
      return false
    } finally {
      operation.value = { kind: 'idle' }
    }
  }

  /**
   * Applies one review decision against the loaded revision.
   * @param command - Review action and its required evidence.
   * @returns Whether the currently selected review adopted the result.
   */
  const execute = async (command: ReviewCommand) => {
    if (!canActivate(command.action)) return false
    const current = detail.value
    const owner = commandContext.capture()
    const nativeOwner = nativeContext.capture()
    if (!current || !owner?.canDispatch() || !nativeOwner?.canDispatch() || !actionReady.value) return false
    const proof = nativeReview.value?.decisionDigest
    const needsDigest = command.action === 'return' || command.action === 'accept'
    if (needsDigest && !proof) return false
    operation.value = { kind: 'submitting' }
    try {
      let response: AgreementSubmissionDetail
      try {
        response = await fetchJson<AgreementSubmissionDetail>(`${base}/${current.submission.id}`, {
          method: 'POST',
          body: {
            action: command.action,
            ...(command.action === 'return' ? { description: command.description } : {}),
            revision: current.submission.egcs_fc_revision,
            ...(needsDigest ? { expectedDecisionDigest: proof } : {})
          }
        })
      } catch (error) {
        if (owner.isCurrent()) {
          const payload = error && typeof error === 'object' && 'data' in error ? error.data : undefined
          const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : undefined
          const code = data && typeof data === 'object' && 'code' in data ? data.code : undefined
          if (code === 'SUBMISSION_FINANCIAL_STALE' || code === 'SUBMISSION_STALE') recovery.value = { kind: 'stale', error }
          else if (!(typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400)) {
            recovery.value = { kind: 'write-failed', error }
          }
          showError(error)
        }
        return false
      }
      if (!nativeOwner.isCurrent()) return false
      committed.value = response
      operation.value = { kind: 'reading-committed' }
      try {
        await native.refresh()
        if (nativeOwner.isCurrent() && native.status() !== 'success') recovery.value = { kind: 'readback-failed' }
      } catch (error) {
        if (nativeOwner.isCurrent()) recovery.value = { kind: 'readback-failed', error }
      }
      return owner.isCurrent()
    } finally {
      operation.value = { kind: 'idle' }
    }
  }

  /**
   * Issues a return from the current, validated dialog opening.
   * @param description - Validated reason from the Return Form.
   * @returns Whether the decision was adopted by this editor.
   */
  const confirmReturn = async (description: string) => {
    if (!returnEditor.session.isOpen.value || !returnContext.capture()?.canDispatch()) return false
    return execute({ action: 'return', description })
  }

  /**
   * Issues a decision that needs no dialog opening.
   * @param command - The selected review decision.
   * @returns Whether the decision was adopted by this editor.
   */
  const run = (command: Exclude<ReviewCommand, { action: 'return' }>) => execute(command)

  return {
    detail, state, latestReceived, sectionComments, actionReady, canReviewRole, canEdit, canAdvanceLifecycle, pending, reloading, failed, stale, warning,
    status: resource.status, error: resource.error, refresh, run,
    returnEditor, openReturn, confirmReturn
  }
}
