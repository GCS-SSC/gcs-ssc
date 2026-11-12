import { computed, nextTick, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'

type EditingRow<T, Target> =
  | { kind: 'create'; draft: Ref<T | null> }
  | { kind: 'edit'; target: Target; draft: Ref<T | null> }

type LocalRowEditorState<T, Target> =
  | { kind: 'closed' }
  | EditingRow<T, Target>
  | { kind: 'closing'; editor: EditingRow<T, Target> }

/**
 * Owns a disposable local row draft and its create/edit target together.
 * @returns Draft bindings and explicit editor transitions.
 */
export const useLocalRowEditor = <T, Target>() => {
  const state: Ref<LocalRowEditorState<T, Target>> = shallowRef({ kind: 'closed' })
  const close = () => {
    state.value = { kind: 'closed' }
  }
  const editor = computed(() => state.value.kind === 'closing' ? state.value.editor : state.value)
  const isOpen = computed({
    get: () => state.value.kind === 'create' || state.value.kind === 'edit',
    /** @param open - The editor's modal visibility. */
    set: (open: boolean) => {
      if (open || state.value.kind === 'closed' || state.value.kind === 'closing') return
      const closing: LocalRowEditorState<T, Target> = { kind: 'closing', editor: state.value }
      state.value = closing
      // Editors emit closure before save/cancel; retain its payload through that synchronous event pair.
      void nextTick(() => {
        if (state.value === closing) close()
      })
    }
  })
  const mode = computed(() => editor.value.kind === 'edit' ? 'edit' : 'create')
  const target = computed(() => editor.value.kind === 'edit' ? editor.value.target : null)
  const draft = computed({
    get: () => editor.value.kind === 'closed' ? null : editor.value.draft.value,
    set: (value: T | null) => {
      if (editor.value.kind !== 'closed') editor.value.draft.value = value
    }
  })

  /** @param value - Isolated initial draft for a new row. */
  const openCreate = (value: T) => {
    const rowDraft: Ref<T | null> = ref(null)
    rowDraft.value = value
    state.value = { kind: 'create', draft: rowDraft }
  }
  /**
   * @param rowTarget - Existing row identity, using the owning collection policy.
   * @param value - Isolated editable draft.
   */
  const openEdit = (rowTarget: Target, value: T) => {
    const rowDraft: Ref<T | null> = ref(null)
    rowDraft.value = value
    state.value = { kind: 'edit', target: rowTarget, draft: rowDraft }
  }

  return { isOpen, mode, target, draft, openCreate, openEdit, close }
}
