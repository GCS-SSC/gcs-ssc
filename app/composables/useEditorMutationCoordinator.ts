/* eslint-disable jsdoc/require-jsdoc -- returned closures are documented by the coordinator contract */
import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'

export type EditorMutationToken = {
  readonly id: number
  readonly session: number
  expectedDraft: string
}

export type EditorMutationRunner = (
  request: () => Promise<unknown>
) => Promise<unknown>

type EditorMutationCoordinatorOptions = {
  getDraft: () => unknown
}

type ApplyMutationRefreshOptions = {
  apply: () => void
  mergeMetadata?: () => void
}

type EditorMutationCoordinator = {
  activeAction: Ref<string | null>
  isDirty: ComputedRef<boolean>
  isPending: ComputedRef<boolean>
  isActionPending: (action: string) => boolean
  replaceSessionDraft: (apply: () => void) => void
  applyMutationRefresh: (
    token: EditorMutationToken,
    options: ApplyMutationRefreshOptions
  ) => boolean
  isTokenCurrent: (token: EditorMutationToken) => boolean
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
 *
 * @param options - Current editable-draft serializer.
 * @returns Mutation ownership, dirty-state, and guarded refresh helpers.
 */
export const useEditorMutationCoordinator = (
  options: EditorMutationCoordinatorOptions
): EditorMutationCoordinator => {
  const activeAction: Ref<string | null> = ref(null)
  const activeToken: Ref<EditorMutationToken | null> = shallowRef(null)
  const persistedDraft: Ref<string | null> = ref(null)
  const session: Ref<number> = ref(0)
  let mutationSequence = 0

  const currentDraft = () => serializeDraft(options.getDraft())
  const isTokenCurrent = (token: EditorMutationToken) => (
    activeToken.value === token && token.session === session.value
  )
  const isPending = computed(() => (
    activeToken.value !== null && activeToken.value.session === session.value
  ))
  const isDirty = computed(() => (
    persistedDraft.value !== null && persistedDraft.value !== currentDraft()
  ))
  const isActionPending = (action: string) => isPending.value && activeAction.value === action

  const replaceSessionDraft = (apply: () => void) => {
    session.value += 1
    activeAction.value = null
    activeToken.value = null
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

  const run = async <T>(
    action: string,
    mutation: (token: EditorMutationToken) => Promise<T>
  ): Promise<T | undefined> => {
    if (isPending.value) return undefined

    const token: EditorMutationToken = {
      id: ++mutationSequence,
      session: session.value,
      expectedDraft: currentDraft()
    }
    activeAction.value = action
    activeToken.value = token
    try {
      return await mutation(token)
    } finally {
      if (activeToken.value === token) {
        activeToken.value = null
        activeAction.value = null
      }
    }
  }

  return {
    activeAction,
    isDirty,
    isPending,
    isActionPending,
    replaceSessionDraft,
    applyMutationRefresh,
    isTokenCurrent,
    run
  }
}
