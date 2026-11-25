/* eslint-disable jsdoc/require-jsdoc -- The correspondence owner exposes named state transitions and projections. */
import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useActionContext } from '~/composables/useActionContext'
import { useResourceRequest } from '~/composables/useResourceRequest'
import { createBrowserUuid } from '~/utils/browser-uuid'
import type { CorrespondenceEntry, CorrespondenceOverview, CorrespondenceThread } from '~~/shared/types/correspondence'

type Opening =
  | { kind: 'start' }
  | { kind: 'question'; threadId: string }
  | { kind: 'note'; threadId: string }
  | { kind: 'reply'; threadId: string; questionId: string }
  | { kind: 'edit'; threadId: string; entry: CorrespondenceEntry }

type Draft = {
  subject: string
  questionId: string
  body: string
  correspondenceAt: string
  internal: boolean
  contactName: string
  contactEmail: string
  files: readonly File[]
}

type Message = { body: string; correspondenceAt: string }
type Contact = { contactName: string; contactEmail?: string }
type EntryCommand =
  | { kind: 'start'; input: Message & { subject: string; internal: boolean } }
  | { kind: 'append'; threadId: string; input: Message & (
    | { kind: 'question' | 'note' }
    | ({ kind: 'reply'; questionId: string } & Contact)
    ) }
    | { kind: 'edit'; threadId: string; entryId: string; input: Message & { editDigest: string } & Partial<Contact> }

type CreateCommand = Extract<EntryCommand, { kind: 'start' | 'append' }>
type ThreadChange = { status: CorrespondenceThread['status'] } | { internal: boolean }
export type CorrespondenceCommand =
  | (CreateCommand & { clientRequestId: string; files: readonly File[] })
  | Extract<EntryCommand, { kind: 'edit' }>
  | { kind: 'thread'; threadId: string; input: ThreadChange }

type Editor = {
  id: number
  opening: Opening
  draft: Draft
  replay: { kind: 'fresh' } | { kind: 'submitted'; fingerprint: string; files: readonly File[]; id: string }
}
type EditorState =
  | { kind: 'closed'; latest: Editor | null }
  | { kind: 'editing'; editor: Editor }

type MutationState =
  | { kind: 'idle' }
  | { kind: 'writing'; token: symbol }
  | { kind: 'reading-back'; token: symbol; after: 'committed' | 'rejected' }
  | { kind: 'disposed' }

const localDate = (now: Date) => new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1)

export const resolveCorrespondenceAt = (value: string, target: Opening | null) => {
  const saved = target?.kind === 'edit' ? target.entry.correspondenceAt : undefined
  return saved && Date.parse(localDate(new Date(saved))) === Date.parse(value) ? saved : value
}

const isReply = (opening: Opening | null) =>
  opening?.kind === 'reply' || (opening?.kind === 'edit' && opening.entry.kind === 'reply')

const entryCommand = (target: Opening, fields: Draft): EntryCommand => {
  const date = resolveCorrespondenceAt(fields.correspondenceAt, target)
  const correspondenceAt = date === fields.correspondenceAt ? new Date(date).toISOString() : date
  const contact = { contactName: fields.contactName.trim(), contactEmail: fields.contactEmail.trim() || undefined }
  const message = { body: fields.body.trim(), correspondenceAt }
  switch (target.kind) {
    case 'start':
      return { kind: 'start', input: { ...message, subject: fields.subject.trim(), internal: fields.internal } }
    case 'question':
    case 'note':
      return { kind: 'append', threadId: target.threadId, input: { ...message, kind: target.kind } }
    case 'reply':
      return { kind: 'append', threadId: target.threadId, input: { ...message, kind: 'reply', questionId: fields.questionId, ...contact } }
    case 'edit':
      return {
        kind: 'edit',
        threadId: target.threadId,
        entryId: target.entry.id,
        input: { ...message, editDigest: target.entry.editDigest, ...(isReply(target) ? contact : {}) }
      }
  }
}

/**
 * Owns the live collection and exclusive write lane independently of the editor.
 * The adapter supplies the resource key, transport and error classification.
 * @param options - Target adapter and section inputs.
 * @param options.target - Stable key for the exact host record.
 * @param options.active - Whether the section is currently visible.
 * @param options.locale - Locale for thread search.
 * @param options.load - Read correspondence for the captured record.
 * @param options.write - Dispatch a validated command for the captured record.
 * @param options.discardsOverview - Whether a rejected read invalidates existing evidence.
 * @param options.invalidatesOverview - Whether a rejected write requires readback.
 * @returns The lifecycle projections and actions used by the correspondence workspace.
 */
export const useCorrespondence = <Overview extends CorrespondenceOverview>(options: {
  target: MaybeRefOrGetter<string>
  active: MaybeRefOrGetter<boolean>
  locale: MaybeRefOrGetter<string>
  load: (target: string, signal: AbortSignal) => Promise<Overview>
  write: (target: string, command: CorrespondenceCommand) => Promise<{ threadId: string }>
  discardsOverview: (error: unknown) => boolean
  invalidatesOverview: (error: unknown) => boolean
}) => {
  const { user, permissionRevision } = useAuth()
  const targetKey = () => toValue(options.target)
  const identity = () => JSON.stringify([targetKey(), user.value?.id, permissionRevision.value])
  const active = () => toValue(options.active)
  const toast = useLocalizedToast()
  const { showError } = useApiErrorToast()
  const activation = ref<'unvisited' | 'visited'>(active() ? 'visited' : 'unvisited')
  const requests = useResourceRequest({
    identity,
    enabled: () => activation.value === 'visited',
    failureData: error => options.discardsOverview(error) ? 'clear' : 'retain',
    load: signal => options.load(targetKey(), signal)
  })
  const { data, status: loadStatus, refresh } = requests
  const search = ref('')
  const statusFilter = ref<'all' | CorrespondenceThread['status']>('all')
  const threads = computed(() => {
    const locale = toValue(options.locale)
    const term = search.value.trim().toLocaleLowerCase(locale)
    return (data.value?.threads ?? [])
      .filter(thread => statusFilter.value === 'all' || thread.status === statusFilter.value)
      .filter(thread => thread.subject.toLocaleLowerCase(locale).includes(term))
      .toSorted((left, right) => Number(left.status === 'resolved') - Number(right.status === 'resolved')
        || Date.parse(right.latestCorrespondenceAt) - Date.parse(left.latestCorrespondenceAt))
  })
  const selectedId = ref<string | null>(null)
  const selectedThread = computed(() => threads.value.find(thread => thread.id === selectedId.value))

  let nextOpeningId = 0
  const editorState = shallowRef<EditorState>({ kind: 'closed', latest: null })
  const latestEditor = computed(() => editorState.value.kind === 'editing' ? editorState.value.editor : editorState.value.latest)
  const opening = computed(() => latestEditor.value?.opening ?? null)
  const draft = computed(() => latestEditor.value?.draft ?? null)
  const editorOpen = computed({
    get: () => editorState.value.kind === 'editing',
    set: open => {
      if (!open && editorState.value.kind === 'editing') {
        editorState.value = { kind: 'closed', latest: editorState.value.editor }
      }
    }
  })
  const isResponse = computed(() => isReply(opening.value))

  let generation = 0
  const mutation = shallowRef<MutationState>({ kind: 'idle' })
  const pending = computed(() => mutation.value.kind === 'writing' || mutation.value.kind === 'reading-back')
  const overviewCurrent = computed(() => loadStatus.value === 'success')
  const canWriteRole = computed(() => data.value?.canWriteRole === true)
  const canWrite = computed(() => overviewCurrent.value && data.value?.canWrite === true)
  const writeControlsDisabled = computed(() => pending.value || !overviewCurrent.value)

  const threadFor = (target: Opening) => 'threadId' in target
    ? data.value?.threads.find(thread => thread.id === target.threadId)
    : undefined
  const openingQuestions = computed(() => opening.value
    ? threadFor(opening.value)?.entries.filter(entry => entry.kind === 'question') ?? []
    : [])
  const admitsOpening = (target: Opening, questionId?: string) => {
    if (target.kind === 'start') return true
    const thread = threadFor(target)
    if (!thread) return false
    if (target.kind === 'question') return thread.status === 'open'
    if (target.kind === 'reply') return thread.entries.some(entry => entry.kind === 'question' && entry.id === (questionId ?? target.questionId))
    if (target.kind === 'note') return true
    const entry = thread.entries.find(candidate => candidate.id === target.entry.id)
    return entry?.canEdit === true && entry.editDigest === target.entry.editDigest
  }
  const canSubmit = computed(() => canWrite.value && opening.value !== null && admitsOpening(opening.value, draft.value?.questionId))
  const actionContext = useActionContext({
    identity: [identity],
    authority: canWriteRole,
    eligible: () => canWrite.value && active()
  })
  const editorActionContext = useActionContext({
    identity: [identity, () => latestEditor.value?.id],
    authority: canWriteRole,
    eligible: () => editorOpen.value && canSubmit.value && active()
  })

  const guardWrite = () => {
    if (pending.value || !canWriteRole.value || !active()) return false
    if (canWrite.value) return true
    const description = data.value?.writeBlock === 'assignment'
      ? 'assignments.read_only_description'
      : data.value?.writeBlock === 'terminal' ? 'agreement_requests.read_only' : 'agreement_requests.load_error'
    toast.add({ title: toast.localized('common.warning'), description: toast.localized(description), color: 'warning' })
    return false
  }

  const openEditor = (target: Opening, thread?: CorrespondenceThread) => {
    if (target.kind !== 'start' && (thread !== selectedThread.value || thread?.id !== target.threadId)) return
    if (!guardWrite() || !admitsOpening(target)) return
    const entry = target.kind === 'edit' ? target.entry : undefined
    const fields = ref<Draft>({
      subject: '',
      questionId: target.kind === 'reply' ? target.questionId : '',
      body: entry?.body ?? '',
      correspondenceAt: localDate(entry ? new Date(entry.correspondenceAt) : new Date()),
      internal: true,
      contactName: entry?.contactName ?? '',
      contactEmail: entry?.contactEmail ?? '',
      files: []
    })
    editorState.value = {
      kind: 'editing',
      editor: { id: ++nextOpeningId, opening: target, draft: fields.value, replay: { kind: 'fresh' } }
    }
  }

  const setFiles = (owner: Draft, files: File[]) => {
    if (!editorOpen.value || pending.value || draft.value !== owner) return
    owner.files = files
  }

  const run = async (command: CorrespondenceCommand, editor: Editor | null) => {
    if (mutation.value.kind !== 'idle') return
    const context = actionContext.capture()
    if (!context?.canDispatch()) return
    const target = targetKey()
    const token = Symbol()
    const capturedGeneration = generation
    const ownsOverview = () => generation === capturedGeneration && mutation.value.kind !== 'disposed'
    const ownsFeedback = () => context.isCurrent() && active() && (!editor || editor === latestEditor.value)
    mutation.value = { kind: 'writing', token }
    try {
      if (!context.canDispatch() || !ownsOverview()) return
      let result
      try {
        result = await options.write(target, command)
      } catch (error) {
        if (ownsFeedback() && (!editor || editorOpen.value)) showError(error)
        if (!ownsOverview() || !options.invalidatesOverview(error)) return
        mutation.value = { kind: 'reading-back', token, after: 'rejected' }
        await refresh()
        return
      }
      if (!ownsOverview()) return
      if (ownsFeedback()) {
        if (editor && editorOpen.value) {
          editorOpen.value = false
          selectedId.value = result.threadId
          if (command.kind === 'start') {
            search.value = ''
            statusFilter.value = 'all'
          }
        }
        toast.add({ title: toast.localized('common.success'), description: toast.localized('agreement_requests.saved'), color: 'success' })
      }
      mutation.value = { kind: 'reading-back', token, after: 'committed' }
      await refresh()
    } finally {
      if ('token' in mutation.value && mutation.value.token === token) mutation.value = { kind: 'idle' }
    }
  }

  const submit = async () => {
    const state = editorState.value
    if (state.kind !== 'editing' || !canSubmit.value || !guardWrite()) return
    const editor = state.editor
    const command = entryCommand(editor.opening, editor.draft)
    if (command.kind === 'edit') {
      await run(command, editor)
      return
    }
    const fingerprint = JSON.stringify(command.input)
    const files = editor.draft.files
    if (editor.replay.kind === 'fresh' || editor.replay.fingerprint !== fingerprint || editor.replay.files !== files) {
      editor.replay = { kind: 'submitted', fingerprint, files, id: createBrowserUuid() }
    }
    await run({ ...command, files: [...files], clientRequestId: editor.replay.id }, editor)
  }

  const patch = async (thread: CorrespondenceThread, input: ThreadChange) => {
    if (thread !== selectedThread.value || !guardWrite()) return
    await run({ kind: 'thread', threadId: thread.id, input }, null)
  }

  const discardEditor = () => {
    editorState.value = { kind: 'closed', latest: null }
    selectedId.value = null
  }

  watch(identity, () => {
    generation += 1
    discardEditor()
    search.value = ''
    statusFilter.value = 'all'
  }, { flush: 'sync' })
  watch(requests.state, state => {
    if (state.kind === 'error' && options.discardsOverview(state.error)) discardEditor()
  }, { flush: 'sync' })
  watch(active, value => {
    if (!value) editorOpen.value = false
    else if (activation.value === 'visited') void refresh()
    else activation.value = 'visited'
  }, { flush: 'sync' })
  onScopeDispose(() => {
    mutation.value = { kind: 'disposed' }
  })

  return {
    identity, data, loadStatus, refresh, search, statusFilter, threads, selectedId, selectedThread,
    opening, draft, editorOpen, editorActionContext, pending, canSubmit, canWriteRole, writeControlsDisabled,
    isResponse, openingQuestions, openEditor, setFiles, submit, patch
  }
}

export type Correspondence = ReturnType<typeof useCorrespondence>
