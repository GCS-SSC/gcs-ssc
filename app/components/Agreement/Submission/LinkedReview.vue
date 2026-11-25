<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { useLinkedAgreementSubmissionReview } from '~/composables/useLinkedAgreementSubmissionReview'

const { review, busy = false, startInHero = false, noticeOnly = false, lifecycle = false } = defineProps<{
  review: ReturnType<typeof useLinkedAgreementSubmissionReview>
  busy?: boolean
  startInHero?: boolean
  noticeOnly?: boolean
  lifecycle?: boolean
}>()
const { t } = useI18n()
const { returnOpen, returnText, returnError, openReturn, closeReturn } = review
const summary = ref<HTMLElement | null>(null)
const detail = review.detail
const state = review.state
const waiting = computed(() => detail.value?.events.findLast(row => row.egcs_fc_kind === 'returned'))
const locked = computed(() => busy || !review.actionReady.value)
const notice = computed(() => {
  if (review.error.value || review.stale.value || review.failed.value) return review.warning.value
  return null
})
const reloading = review.reloading
watch(state, (current, previous) => {
  if (startInHero && previous === 'submitted' && current === 'reviewing') summary.value?.focus()
}, { flush: 'post' })

/**
 * Runs a transition from the host financial editor's review section.
 * @param action - The selected review action.
 */
const execute = async (action: 'start' | 'return' | 'accept') => {
  if (locked.value) return
  const changed = action === 'return' ? await review.confirmReturn() : await review.run({ action })
  if (!changed) return
  await nextTick()
  summary.value?.focus()
}
</script>

<template>
  <CommonNotice v-if="notice" :tone="review.stale.value ? 'warning' : 'error'" :title="t(notice)">
    <template #actions>
      <UButton color="error" variant="outline" :loading="reloading" :disabled="busy || review.pending.value" @click="review.refresh">
        {{ t('submission.reload') }}
      </UButton>
    </template>
  </CommonNotice>
  <div v-else-if="lifecycle && detail && !review.canAdvanceLifecycle.value" class="flex justify-end">
    <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="reloading" :disabled="busy || review.pending.value" @click="review.refresh">
      {{ t('submission.reload') }}
    </UButton>
  </div>
  <div v-if="!noticeOnly && detail && state" ref="summary" tabindex="-1" class="space-y-4 empty:hidden">
    <div v-if="state !== 'accepted'" class="flex flex-wrap justify-end gap-2">
      <UButton v-if="!notice" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="reloading" :disabled="busy || review.pending.value" @click="review.refresh">
        {{ t('submission.reload') }}
      </UButton>
      <UButton v-if="!startInHero && state === 'submitted' && review.canReviewRole.value" icon="i-lucide-play" :loading="review.pending.value" :disabled="locked" @click="execute('start')">
        {{ t('submission.start') }}
      </UButton>
      <template v-else-if="state === 'reviewing' && review.canReviewRole.value">
        <UButton color="warning" variant="outline" :disabled="locked" @click="openReturn">
          {{ t('submission.return') }}
        </UButton>
        <UButton icon="i-lucide-check" :loading="review.pending.value" :disabled="locked" @click="execute('accept')">
          {{ t('submission.accept') }}
        </UButton>
      </template>
    </div>
    <CommonNotice v-if="state === 'returned'" tone="warning" :title="t('submission.waiting')" :description="waiting?.egcs_fc_description ?? undefined" />
    <section v-if="returnOpen && state === 'reviewing'" class="space-y-4 rounded-md border border-default p-4">
      <UFormField data-field-scope="agreement.linked-submission" name="description" required :label="t('submission.return_description')" :error="returnError ? t('validation.required') : undefined">
        <UTextarea v-model="returnText" class="w-full" required :maxlength="500" :disabled="locked" @update:model-value="returnError = false" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton color="warning" :loading="review.pending.value" :disabled="locked" @click="execute('return')">
          {{ t('submission.confirm_return') }}
        </UButton>
        <UButton color="neutral" variant="outline" :disabled="locked" @click="closeReturn">
          {{ t('common.cancel') }}
        </UButton>
      </div>
    </section>
  </div>
</template>
