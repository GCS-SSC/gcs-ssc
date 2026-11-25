<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { allowsLinkedSubmissionAction } from '~~/shared/utils/agreement-linked-submission-policy'
import { useActionContext } from '~/composables/useActionContext'
import type { useLinkedAgreementSubmissionReview } from '~/composables/useLinkedAgreementSubmissionReview'

const { review, busy = false, startInHero = false, noticeOnly = false } = defineProps<{
  review: ReturnType<typeof useLinkedAgreementSubmissionReview>
  busy?: boolean
  startInHero?: boolean
  noticeOnly?: boolean
}>()
const { t } = useI18n()
const { returnEditor, openReturn } = review
const summary = ref<HTMLElement | null>(null)
const detail = review.detail
const state = review.state
const focusContext = useActionContext({
  identity: [() => detail.value?.submission.id],
  authority: review.canReviewRole
})
const waiting = computed(() => detail.value?.events.findLast(row => row.egcs_fc_kind === 'returned'))
const locked = computed(() => busy || !review.actionReady.value)
const notice = computed(() => {
  if (review.error.value || review.stale.value || review.failed.value) return review.warning.value
  return null
})
watch(state, (current, previous) => {
  if (startInHero && previous === 'submitted' && current === 'reviewing') summary.value?.focus()
}, { flush: 'post' })

/**
 * Runs a transition from the host financial editor's review section.
 * @param decision - The selected decision and any validated reason.
 */
const execute = async (decision: Parameters<typeof review.run>[0] | { action: 'return'; description: string }) => {
  if (locked.value) return
  const owner = focusContext.capture()
  if (!owner?.canDispatch()) return
  const changed = decision.action === 'return'
    ? await review.confirmReturn(decision.description)
    : await review.run(decision)
  if (!changed) return
  await nextTick()
  if (owner.isCurrent()) summary.value?.focus()
}
</script>

<template>
  <CommonNotice v-if="notice" :tone="review.stale.value ? 'warning' : 'error'" :title="t(notice)" />
  <div v-if="!noticeOnly && detail && state" ref="summary" tabindex="-1" class="space-y-4 empty:hidden">
    <div v-if="state !== 'accepted'" class="flex flex-wrap justify-end gap-2 empty:hidden">
      <UButton v-if="!startInHero && state === 'submitted' && review.canReviewRole.value" icon="i-lucide-play" :loading="review.pending.value" :disabled="locked" @click="execute({ action: 'start' })">
        {{ t('submission.start') }}
      </UButton>
      <template v-else-if="state === 'reviewing' && review.canReviewRole.value">
        <AgreementSubmissionReturnDialog
          :editor="returnEditor"
          :busy="review.pending.value"
          :disabled="locked"
          @confirm="description => execute({ action: 'return', description })">
          <template #trigger>
            <UButton color="warning" :disabled="locked" @click="openReturn">
              {{ t('submission.return') }}
            </UButton>
          </template>
          <UFormField data-field-scope="agreement.linked-submission" name="description" required :label="t('submission.return_description')">
            <UTextarea v-model="returnEditor.draft.description" class="w-full" required :maxlength="500" :disabled="locked" />
          </UFormField>
        </AgreementSubmissionReturnDialog>
        <UButton icon="i-lucide-check" :loading="review.pending.value" :disabled="locked" @click="execute({ action: 'accept' })">
          {{ t('submission.accept') }}
        </UButton>
      </template>
      <UButton v-else-if="allowsLinkedSubmissionAction(state, 'withdraw_return') && review.canReviewRole.value" color="warning" :loading="review.pending.value" :disabled="locked" @click="execute({ action: 'withdraw_return' })">
        {{ t('submission.withdraw_return') }}
      </UButton>
    </div>
    <CommonNotice v-if="state === 'returned' || state === 'proponent_editing'" tone="warning" :title="t(state === 'returned' ? 'submission.waiting' : 'submission.proponent_editing')" :description="waiting?.egcs_fc_description ?? undefined" />
  </div>
</template>
