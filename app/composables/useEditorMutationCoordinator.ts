/* eslint-disable jsdoc/require-jsdoc -- returned closures are documented by the coordinator contract */
import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ActionContext, CapturedActionContext } from '~/composables/useActionContext'

export type EditorMutationToken = {
  readonly id: number
  readonly session: number
  expectedDraft: string
  readonly operation: CapturedActionContext
}

export type EditorMutationRunner = (
  request: () => Promise<unknown>
) => Promise<unknown>

type EditorMutationCoordinatorOptions = {
  getDraft: () => unknown
  context: ActionContext
}

type ApplyMutationRefreshOptions = {
  apply: () => void
  mergeMetadata?: () => void
}

type EditorMutationState =
  | { kind: 'idle' }
  | { kind: 'pending'; action: string; token: EditorMutationToken }
  | { kind: 'disposed' }

type EditorMutationCoordinator = {
  activeAction: ComputedRef<string | null>
  isDirty: ComputedRef<boolean>
  isPending: ComputedRef<boolean>
  isActionPending: (action: string) => boolean
  replaceSessionDraft: (apply: () => void) => void
  acceptCommittedDraft: (token: EditorMutationToken, draft?: unknown) => boolean
  applyMutationRefresh: (
    token: EditorMutationToken,
    options: ApplyMutationRefreshOptions
  ) => boolean
  isTokenCurrent: (token: EditorMutationToken) => boolean
  canContinue: (token: EditorMutationToken) => boolean
  run: <T>(
    action: string,
    mutation: (token: EditorMutationToken) => Promise<T>
  ) => Promise<T | undefined>
}

const serializeDraft = (value: unknown) => JSON.stringify(value) ?? 'undefined'

/**
 * Serializes every write owned by one editor and isolates refreshes by editor session.
 *
 * The caller owns the draft shape and server requests. A completed mutation may replace
 * the draft only while its session is current and the user has not changed the draft
 * since dispatch. A same-session stale completion may still merge non-editable metadata.
 * Confirmed whole-draft writes accept their committed baseline before refresh; child
 * and metadata writes leave that baseline unchanged.
 * Required action context separates canContinue admission from committed settlement.
 * Ending the owning Vue scope invalidates its writes and refreshes.
 *
 * @param options - Current editable-draft serializer.
 * @returns Mutation ownership, dirty-state, and guarded refresh helpers.
 */
export const useEditorMutationCoordinator = (
  options: EditorMutationCoordinatorOptions
): EditorMutationCoordinator => {
  const mutationState: Ref<EditorMutationState> = shallowRef({ kind: 'idle' })
  const activeAction = computed(() => (
    mutationState.value.kind === 'pending' ? mutationState.value.action : null
  ))
  const persistedDraft: Ref<string | null> = ref(null)
  const session: Ref<number> = ref(0)
  let mutationSequence = 0

  const currentDraft = () => serializeDraft(options.getDraft())
  const isTokenCurrent = (token: EditorMutationToken) => (
    mutationState.value.kind === 'pending'
    && mutationState.value.token === token
    && token.session === session.value
    && token.operation.isCurrent()
  )
  const canContinue = (token: EditorMutationToken) => isTokenCurrent(token)
    && token.operation.canDispatch()
  const isPending = computed(() => (
    mutationState.value.kind === 'pending' && mutationState.value.token.session === session.value
  ))
  const isDirty = computed(() => (
    persistedDraft.value !== null && persistedDraft.value !== currentDraft()
  ))
  const isActionPending = (action: string) => isPending.value && activeAction.value === action

  const replaceSessionDraft = (apply: () => void) => {
    if (mutationState.value.kind === 'disposed') return
    session.value += 1
    mutationState.value = { kind: 'idle' }
    apply()
    persistedDraft.value = currentDraft()
  }

  const applyMutationRefresh = (
    token: EditorMutationToken,
    { apply, mergeMetadata }: ApplyMutationRefreshOptions
  ) => {
    if (!isTokenCurrent(token)) return false
    if (currentDraft() !== token.expectedDraft) {
      mergeMetadata?.()
      return false
    }

    apply()
    token.expectedDraft = currentDraft()
    persistedDraft.value = token.expectedDraft
    return true
  }

  const acceptCommittedDraft = (token: EditorMutationToken, draft?: unknown) => {
    if (!isTokenCurrent(token)) return false
    persistedDraft.value = draft === undefined ? token.expectedDraft : serializeDraft(draft)
    return true
  }

  const run = async <T>(
    action: string,
    mutation: (token: EditorMutationToken) => Promise<T>
  ): Promise<T | undefined> => {
    if (mutationState.value.kind === 'disposed' || isPending.value) return undefined
    const operation = options.context.capture()
    if (!operation) return undefined

    const token: EditorMutationToken = {
      id: ++mutationSequence,
      session: session.value,
      expectedDraft: currentDraft(),
      operation
    }
    mutationState.value = { kind: 'pending', action, token }
    try {
      return await mutation(token)
    } finally {
      if (mutationState.value.kind === 'pending' && mutationState.value.token === token) {
        mutationState.value = { kind: 'idle' }
      }
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      mutationState.value = { kind: 'disposed' }
    })
  }

  return {
    activeAction,
    isDirty,
    isPending,
    isActionPending,
    replaceSessionDraft,
    acceptCommittedDraft,
    applyMutationRefresh,
    isTokenCurrent,
    canContinue,
    run
  }
}
