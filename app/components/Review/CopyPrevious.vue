<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { FetchError, ofetch } from 'ofetch'
import { resolveApiErrorDescription } from '~/composables/useApiErrorToast'
import type { ReviewCopyChoice, ReviewCopyResult } from '~~/shared/types/review-copy'

type ReviewCopyResponse = Extract<ReviewCopyResult, { response: unknown }>
type ChooserState =
  | { kind: 'loading' }
  | { kind: 'load_error'; error: unknown; retryable: boolean }
  | { kind: 'no_history' | 'version_mismatch' }
  | { kind: 'choices'; choices: ReviewCopyChoice[]; selected: string | null; confirmedDraft: string | null }

const {
  reviewId,
  publicationVersionId,
  kind,
  authority,
  eligible,
  saving,
  hasContent,
  getDraft
} = defineProps<{
  reviewId: string
  publicationVersionId: string
  kind: 'assessment' | 'checklist'
  authority: boolean
  eligible: boolean
  saving: boolean
  hasContent: boolean
  getDraft: () => string
}>()

const emit = defineEmits<{ apply: [result: ReviewCopyResponse] }>()
const { t, locale } = useI18n()
const { resolveDetails } = useApiErrorToast()
const toast = useLocalizedToast()
const { isOpen, captureSession, isCurrentSession } = useModalSession()
const action = useActionContext({
  identity: [() => reviewId, () => publicationVersionId, () => kind],
  authority: () => authority,
  eligible: () => !saving
})
const state = shallowRef<ChooserState>({ kind: 'loading' })
const applyError = shallowRef<{ messages: string[] } | null>(null)
const applying = shallowRef(false)
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'medium' }))
watch(action.version, () => {
  isOpen.value = false
}, { flush: 'sync' })
watch(() => eligible, () => {
  isOpen.value = false
}, { flush: 'sync' })

/**
 * Fetches choices or the validated response for the selected source.
 * @param source - Selected previous Review ID, or empty to load the chooser.
 * @returns History or the validated copy payload.
 */
const request = (source?: string) => ofetch<ReviewCopyResult>(`/api/reviews/${reviewId}/copy-previous`, {
  query: { kind, source },
  headers: { 'accept-language': locale.value },
  retry: false
})
const errorMessages = (error: unknown) => {
  const details = resolveDetails(error)
  return details.length ? details : [resolveApiErrorDescription(error, t('review_copy.failed'))]
}

/** Loads history for the current modal opening. */
const load = async () => {
  const admission = action.capture()
  const session = captureSession()
  if (!admission || session === null) return
  state.value = { kind: 'loading' }
  applyError.value = null
  try {
    const result = await request()
    if (!admission.canDispatch() || !isCurrentSession(session)) return
    if (result.kind === 'choices') {
      state.value = { ...result, selected: null, confirmedDraft: null }
    } else if (result.kind === 'no_history' || result.kind === 'version_mismatch') {
      state.value = { kind: result.kind }
    }
  } catch (error) {
    if (!admission.canDispatch() || !isCurrentSession(session)) return
    const status = error instanceof FetchError ? error.statusCode : undefined
    state.value = { kind: 'load_error', error, retryable: status === undefined || status >= 500 || status === 408 || status === 429 }
  }
}

watch(isOpen, open => {
  if (open) void load()
}, { flush: 'sync' })

/**
 * Selects a source and resets the overwrite confirmation.
 * @param id - Selected previous Review ID.
 */
const select = (id: string) => {
  if (state.value.kind !== 'choices' || applying.value) return
  state.value = { ...state.value, selected: id, confirmedDraft: null }
  applyError.value = null
}

/** Applies a validated copy only while the same modal and draft still own it. */
const apply = async () => {
  const selection = state.value
  if (selection.kind !== 'choices' || !selection.selected || applying.value) return
  const admission = action.capture()
  const session = captureSession()
  if (!admission || session === null) return
  if (!eligible) {
    applyError.value = { messages: [t('review_copy.draft_unavailable')] }
    return
  }
  const draft = getDraft()
  if (hasContent && selection.confirmedDraft !== draft) {
    state.value = { ...selection, confirmedDraft: draft }
    return
  }
  applying.value = true
  applyError.value = null
  try {
    const result = await request(selection.selected)
    if (!admission.canDispatch() || !isCurrentSession(session)) return
    if (getDraft() !== draft) {
      state.value = { ...selection, confirmedDraft: null }
      applyError.value = { messages: [t('review_copy.draft_changed')] }
    } else if (result.kind === 'version_mismatch') {
      applyError.value = { messages: [t('review_copy.selected_version_mismatch')] }
    } else if (result.kind === kind) {
      emit('apply', result)
      isOpen.value = false
      toast.add({
        title: toast.localized('review_copy.copied_title'),
        description: toast.localized('review_copy.copied'),
        color: 'success'
      })
    }
  } catch (error) {
    if (admission.canDispatch() && isCurrentSession(session)) {
      applyError.value = { messages: errorMessages(error) }
    }
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <UModal
    v-if="authority"
    v-model:open="isOpen"
    :title="t('review_copy.action')"
    :description="t(`review_copy.${kind}.description`)"
    :ui="{ content: 'sm:max-w-3xl' }">
    <UButton
      type="button"
      color="neutral"
      variant="outline"
      icon="i-lucide-copy"
      class="min-w-0 max-w-full text-left"
      :ui="{ label: 'whitespace-normal' }"
      :label="t('review_copy.action')"
      :disabled="saving || applying" />
    <template #body>
      <p v-if="state.kind === 'loading'" role="status" class="text-sm text-muted">
        {{ t('common.loading') }}
      </p>
      <CommonErrorNotice
        v-else-if="state.kind === 'load_error'"
        :title="t('review_copy.failed')"
        :description="errorMessages(state.error).join(' ')">
        <template v-if="state.retryable" #actions>
          <UButton :label="t('common.retry')" @click="load" />
        </template>
      </CommonErrorNotice>
      <p v-else-if="state.kind === 'no_history'" role="status" class="text-sm text-muted">
        {{ t(`review_copy.${kind}.no_history`) }}
      </p>
      <CommonNotice
        v-else-if="state.kind === 'version_mismatch'"
        tone="warning"
        role="alert"
        :description="t(`review_copy.${kind}.version_mismatch`)" />
      <template v-else-if="state.kind === 'choices'">
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="choice in state.choices"
            :key="choice.id"
            type="button"
            class="rounded-md border p-4 text-left transition-colors"
            :class="state.selected === choice.id ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/60'"
            :aria-pressed="state.selected === choice.id"
            :disabled="applying"
            @click="select(choice.id)">
            <span class="flex flex-wrap items-start justify-between gap-2">
              <time :datetime="choice.completedAt" class="font-semibold text-highlighted">{{ dateFormat.format(new Date(choice.completedAt)) }}</time>
              <CommonStatusBadge v-if="!choice.isLatest" variant="meta" size="sm" :label="t('review_copy.not_latest')" />
            </span>
            <span class="mt-2 block">
              <CommonLifecycleBadge engine="runtime" :state="choice.outcome" />
            </span>
          </button>
        </div>
        <CommonNotice
          v-if="state.confirmedDraft !== null"
          class="mt-4"
          tone="warning"
          role="status"
          :description="t('review_copy.overwrite')" />
        <CommonErrorNotice
          v-if="applyError"
          class="mt-4"
          :title="t('review_copy.failed')"
          :description="applyError.messages.join(' ')" />
      </template>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="t('common.cancel')" @click="isOpen = false" />
        <UButton
          v-if="state.kind === 'choices'"
          icon="i-lucide-copy"
          class="min-w-0 max-w-full text-left"
          :ui="{ label: 'whitespace-normal' }"
          :label="t(state.confirmedDraft !== null ? 'review_copy.replace' : 'review_copy.apply')"
          :disabled="!state.selected"
          :loading="applying"
          @click="apply" />
      </div>
    </template>
  </UModal>
</template>
