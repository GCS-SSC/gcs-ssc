<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- request closure is local to the coordinated submit */
import { throwFetchResponseError } from '~/utils/fetch-error'
import { getClientRequestUrl } from '~/utils/client-request-url'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import {
  TransferPaymentStreamReviewSetupMemberCreateSchema,
  TransferPaymentStreamReviewSetupMemberPatchSchema
} from '~~/shared/types/schemas'
import type { EditorMutationRunner } from '~/composables/useEditorMutationCoordinator'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
type ReviewSetupMemberState = Partial<z.input<typeof TransferPaymentStreamReviewSetupMemberCreateSchema>> & {
  id?: string
  egcs_cn_reviewtype?: 'assessment' | 'checklist'
  egcs_cn_failonchecklistfailure?: boolean
  egcs_cn_failurethreshold?: number | null
}
const state = defineModel<ReviewSetupMemberState | null>('state', { required: true })

const {
  transferPaymentId,
  streamId,
  reviewSetupId,
  agencyId,
  entityType,
  mutationPending = false,
  runMutation
} = defineProps<{
  transferPaymentId: string
  streamId: string
  reviewSetupId: string
  agencyId?: string
  entityType: string
  mutationPending?: boolean
  runMutation?: EditorMutationRunner
}>()

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()

const isSubmitting = ref(false)
const isUpdate = computed(() => Boolean(state.value?.id))
const validateCreate = createValidator(TransferPaymentStreamReviewSetupMemberCreateSchema)
const validatePatch = createValidator(TransferPaymentStreamReviewSetupMemberPatchSchema)
/**
 * Applies the correct validator for create versus update flows.
 *
 * @param payload - Review-setup member form payload from the modal.
 * @returns Validation issues from the active schema validator.
 */
const validate = async (
  payload:
    | z.infer<typeof TransferPaymentStreamReviewSetupMemberCreateSchema>
    | z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>
) => {
  const { id: _id, ...editablePayload } = payload as typeof payload & { id?: string }
  if (isUpdate.value) {
    return await validatePatch(editablePayload as z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>)
  }

  return await validateCreate(editablePayload as z.infer<typeof TransferPaymentStreamReviewSetupMemberCreateSchema>)
}
const modalTitle = computed(() => (
  isUpdate.value ? t('transfer_payment.review_setup_member_update') : t('transfer_payment.review_setup_member_create')
))
const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))

/**
 * Persists editable review-setup member fields for the selected stream-scoped review set.
 *
 * @param event - Validated review-setup member patch payload from the modal form.
 */
const onSubmit = async (
  event: FormSubmitEvent<
    z.infer<typeof TransferPaymentStreamReviewSetupMemberCreateSchema> |
    z.infer<typeof TransferPaymentStreamReviewSetupMemberPatchSchema>
  >
) => {
  if (isSubmitting.value || mutationPending) {
    return
  }

  try {
    isSubmitting.value = true
    const itemId = state.value?.id ? String(state.value.id) : null
    const { id: _id, ...body } = event.data as typeof event.data & { id?: string }

    const request = async () => {
      const response = await fetch(getClientRequestUrl(itemId
        ? `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${reviewSetupId}/items/${itemId}`
        : `/api/transfer-payments/${transferPaymentId}/streams/${streamId}/review-setups/${reviewSetupId}/items`), {
        method: itemId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) await throwFetchResponseError(response)
      return true
    }
    const completed = runMutation ? await runMutation(request) : await request()
    if (completed === undefined) return

    open.value = false
    emit('saved')
  } catch (error) {
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" @submit="onSubmit">
        <fieldset :disabled="isSubmitting || mutationPending" class="space-y-4">
          <ReviewAssessmentSetItemFields
            v-model:state="state"
            :transfer-payment-id="transferPaymentId"
            :stream-id="streamId"
            :agency-id="agencyId"
            :entity-type="entityType"
            :review-type="typeof state.egcs_cn_reviewtype === 'string' ? state.egcs_cn_reviewtype : undefined"
            stacked-layout />
          <UFormField
            v-if="state.egcs_cn_reviewtype === 'checklist'"
            :label="t('transfer_payment.fail_on_checklist_failure')"
            :description="t('transfer_payment.fail_on_checklist_failure_help')"
            name="egcs_cn_failonchecklistfailure">
            <USwitch v-model="state.egcs_cn_failonchecklistfailure" />
          </UFormField>
          <UFormField
            v-else-if="state.egcs_cn_reviewtype === 'assessment'"
            :label="t('transfer_payment.assessment_failure_threshold')"
            :description="t('transfer_payment.assessment_failure_threshold_help')"
            name="egcs_cn_failurethreshold">
            <UInputNumber v-model="state.egcs_cn_failurethreshold" :step="0.01" class="w-full" :placeholder="t('transfer_payment.assessment_failure_threshold_placeholder')" />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
            <CommonSaveButton :label="submitLabel" :loading="isSubmitting || mutationPending" :disabled="isSubmitting || mutationPending" />
          </div>
        </fieldset>
      </UForm>
    </template>
  </UModal>
</template>
