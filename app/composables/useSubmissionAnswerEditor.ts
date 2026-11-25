/* eslint-disable jsdoc/require-jsdoc -- The returned actions implement the editor lifecycle described below. */
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { z } from 'zod'
import type { FetchError } from 'ofetch'
import { useActionContext, type ActionContext } from '~/composables/useActionContext'
import { useCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { CommittedReadbackResult } from '~/composables/useCommittedSettlement'
import { useFormSession } from '~/composables/useFormSession'
import { useZodI18n } from '~/composables/useZodI18n'
import { agreementCustomFieldMergeSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldPatch, AgreementCustomFieldValues, AssignedAgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import type { FundingCaseAgreementClaimPatch } from '~~/shared/types/schemas/funding-case-agreement'
import { changedCustomFieldAnswers } from '~~/shared/utils/agreement-custom-field-answers'

type AnswerReadStatus = 'idle' | 'pending' | 'success' | 'error'
type AnswerReadEvidence = { status: AnswerReadStatus; error?: FetchError | null }

const isDefinitiveReadError = (error?: FetchError | null) =>
  [401, 403, 404, 410].some(code => code === (error?.statusCode ?? error?.status ?? error?.response?.status))

/**
 * Retains accepted role authority through transient reads, while requiring fresh
 * evidence and normal business prerequisites for each new editing operation.
 * @param options - Page-owned evidence and resource identities.
 * @param options.identity - Reactive owner identifiers.
 * @param options.profile - Current context request status, error and role.
 * @param options.record - Current overview request status, error and target containment.
 * @param options.eligible - Live page and business eligibility.
 * @returns Separate draft lifetime and write admission contexts.
 */
export const useSubmissionAnswerContexts = (options: {
  identity: Parameters<typeof useActionContext>[0]['identity']
  profile: () => AnswerReadEvidence & { canUpdate: boolean }
  record: () => AnswerReadEvidence & { matches: boolean }
  eligible: () => boolean
}) => {
  const authority = ref(false)
  watch([options.profile, options.record], ([profile, record]) => {
    if (isDefinitiveReadError(profile.error) || isDefinitiveReadError(record.error)
      || (record.status === 'success' && !record.matches)) {
      authority.value = false
    } else if (profile.status === 'success') {
      authority.value = profile.canUpdate
    }
  }, { immediate: true, flush: 'sync' })
  const owner = { identity: options.identity, authority }
  return {
    openingContext: useActionContext(owner),
    context: useActionContext({
      ...owner,
      eligible: () => options.profile().status === 'success' && options.record().status === 'success' && options.eligible()
    })
  }
}

type AnswerDraft = { egcs_fc_customfields: AgreementCustomFieldPatch }
type AnswerPrecondition = NonNullable<FundingCaseAgreementClaimPatch['customFieldPrecondition']>
type AnswerEditorState =
  | { kind: 'reading' }
  | { kind: 'editing'; session: number; status: 'current' | 'stale'; submissionRevision: number | null; baseline: AgreementCustomFieldPatch; draft: AnswerDraft }

const copyAnswer = (answer: AgreementCustomFieldPatch[string]): AgreementCustomFieldPatch[string] => {
  if (Array.isArray(answer)) return [...answer]
  if (!answer || typeof answer !== 'object' || !('rows' in answer)) return answer
  return {
    rows: answer.rows.map(row => ({
      id: row.id,
      cells: Object.fromEntries(Object.entries(row.cells).map(([id, value]) => [id, Array.isArray(value) ? [...value] : value]))
    }))
  }
}

const copyAnswers = (answers: AgreementCustomFieldPatch): AgreementCustomFieldPatch =>
  Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, copyAnswer(answer)]))

/**
 * Owns an inline answer draft and its single write through committed readback.
 * The page supplies authorization, transport and its authoritative read.
 * @param options - Answer resource and action bindings.
 * @param options.context - Page-owned action identity and authorization.
 * @param options.openingContext - Actor, security, record and role lifetime independent of read eligibility.
 * @param options.readAnswers - Last accepted answers for a new opening.
 * @param options.readSubmissionRevision - Last accepted linked Submission revision, or null for an unlinked financial record.
 * @param options.readDefinitions - Pinned definitions for validation.
 * @param options.isBlocked - Other active operations that block editing.
 * @param options.persist - Writes changed keys and reports whether values changed.
 * @param options.readback - Refreshes the live page after acknowledgment.
 * @param options.onDenied - Reports an unavailable edit action.
 * @param options.isConflict - Identifies an outdated opening that must be reloaded.
 * @param options.onError - Reports a rejected save to its current editor.
 * @param options.onSaved - Reports a confirmed change after successful readback.
 * @returns Toggle, form session, save eligibility, and write state for the view.
 */
export const useSubmissionAnswerEditor = (options: {
  context: ActionContext
  openingContext: ActionContext
  readAnswers: () => AgreementCustomFieldValues
  readSubmissionRevision: () => number | null
  readDefinitions: () => AssignedAgencyCustomFieldDefinition[]
  isBlocked: () => boolean
  persist: (changes: AgreementCustomFieldPatch, precondition: AnswerPrecondition) => Promise<boolean>
  readback: () => Promise<CommittedReadbackResult>
  onDenied: () => void
  isConflict: (error: unknown) => boolean
  onError: (error: unknown) => void
  onSaved: () => void
}) => {
  const editor: Ref<AnswerEditorState> = ref({ kind: 'reading' })
  const isSaving = ref(false)
  const { createValidator } = useZodI18n()
  const validate = computed(() => createValidator(z.object({
    egcs_fc_customfields: agreementCustomFieldMergeSchema(options.readDefinitions(), options.readAnswers(), { requireAnswers: false })
  })))
  const captureSettlement = useCommittedSettlement({ context: options.context, settle: options.readback })
  let nextSession = 0
  const draft = computed(() => editor.value.kind === 'editing' ? editor.value.draft : null)
  const changes = computed(() => editor.value.kind === 'editing'
    ? changedCustomFieldAnswers(editor.value.baseline, editor.value.draft.egcs_fc_customfields)
    : {})
  const isDirty = computed(() => Object.keys(changes.value).length > 0)
  const isStale = computed(() => editor.value.kind === 'editing' && editor.value.status === 'stale')
  const canSave = computed(() => !isStale.value && isDirty.value && !options.readDefinitions().some(field =>
    field.egcs_ay_kind === 'number' && typeof changes.value[field.id] === 'string'
  ))
  const captureSession = () => editor.value.kind === 'editing' ? editor.value.session : null
  const isCurrentSession = (session: number | null) => session !== null && session === captureSession()
  const close = () => {
    editor.value = { kind: 'reading' }
  }

  watch(options.openingContext.version, close, { flush: 'sync' })

  const setEditing = (enabled: boolean) => {
    if (isSaving.value || options.isBlocked() || isStale.value) return
    if (!enabled) {
      close()
      return
    }
    if (draft.value) return
    if (!options.context.capture()?.canDispatch()) {
      options.onDenied()
      return
    }
    const baseline = copyAnswers(options.readAnswers())
    editor.value = {
      kind: 'editing', session: ++nextSession, status: 'current', baseline,
      submissionRevision: options.readSubmissionRevision(),
      draft: { egcs_fc_customfields: copyAnswers(baseline) }
    }
  }

  const save = async () => {
    const opening = editor.value
    if (opening.kind !== 'editing' || isSaving.value || options.isBlocked() || !canSave.value) return
    const { session, submissionRevision, baseline } = opening
    const settlement = captureSettlement()
    if (!settlement?.canDispatch()) return
    const patch = copyAnswers(changes.value)
    const previousAnswers = Object.fromEntries(Object.keys(patch).map(key => [key, baseline[key] ?? null]))
    isSaving.value = true
    try {
      const changed = await options.persist(patch, { submissionRevision, previousAnswers })
      const ownsEditor = isCurrentSession(session)
      if (ownsEditor) close()
      const readback = await settlement.settle()
      if (changed && ownsEditor && readback.kind === 'refreshed' && nextSession === session) options.onSaved()
    } catch (error: unknown) {
      if (isCurrentSession(session)) {
        if (options.isConflict(error)) opening.status = 'stale'
        else options.onError(error)
      }
    } finally {
      isSaving.value = false
    }
  }

  const formSession = useFormSession({
    owner: { captureSession, isCurrentSession },
    action: { kind: 'remote', context: options.context },
    submit: save,
    onDenied: options.onDenied
  })

  const discardStaleDraft = () => {
    if (!isStale.value || isSaving.value || options.isBlocked()) return false
    close()
    return true
  }

  return { draft, isDirty, canSave, isSaving, isStale, setEditing, discardStaleDraft, formSession, validate }
}
