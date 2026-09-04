<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local modal helpers are self-documenting and not public APIs */
import { getClientRequestUrl } from '~/utils/client-request-url'
import { buildAssessmentSetSubmitRequest, submitAssessmentModalRequest } from '~/utils/transfer-payment-assessment-modal'
import type { FormSubmitEvent } from '#ui/types'
import type { z } from 'zod'
import {
  TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM,
  TransferPaymentAssessmentSetCreateSchema,
  TransferPaymentAssessmentSetPatchSchema
} from '~~/shared/types/schemas'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Record<string, unknown> | null>('state', { required: true })

const { transferPaymentId, streamId } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
}>()

const { t } = useI18n()
const { createValidator } = useZodI18n()
const { showError } = useApiErrorToast()

const isSubmitting = ref(false)
const modalSession = ref(0)
watch(open, () => {
  modalSession.value += 1
  isSubmitting.value = false
})
const isUpdate = computed(() => Boolean(state.value?.id))
const validateCreate = createValidator(TransferPaymentAssessmentSetCreateSchema)
const validatePatch = createValidator(TransferPaymentAssessmentSetPatchSchema)
const validate = async (
  payload:
    | z.infer<typeof TransferPaymentAssessmentSetCreateSchema>
    | z.infer<typeof TransferPaymentAssessmentSetPatchSchema>
) => {
  if (isUpdate.value) {
    return await validatePatch(payload as z.infer<typeof TransferPaymentAssessmentSetPatchSchema>)
  }

  return await validateCreate(payload as z.infer<typeof TransferPaymentAssessmentSetCreateSchema>)
}

const modalTitle = computed(() => (
  isUpdate.value ? t('transfer_payment.assessment_set_update') : t('transfer_payment.assessment_set_create')
))
const submitLabel = computed(() => (isUpdate.value ? t('common.update') : t('common.save')))
const entityTypeItems = computed(() => TRANSFER_PAYMENT_REVIEW_SETUP_ENTITY_TYPE_ENUM.map(value => ({
  label: t(`enums.entity_type.${value}`),
  value
})))

const onSubmit = async (
  event: FormSubmitEvent<
    z.infer<typeof TransferPaymentAssessmentSetCreateSchema> |
    z.infer<typeof TransferPaymentAssessmentSetPatchSchema>
  >
) => {
  const assessmentSetId = state.value?.id ? String(state.value.id) : null
  await submitAssessmentModalRequest({
    isSubmitting,
    session: modalSession,
    open,
    request: buildAssessmentSetSubmitRequest(transferPaymentId, streamId, assessmentSetId),
    data: event.data,
    buildRequestUrl: getClientRequestUrl,
    emitSaved: () => emit('saved'),
    showError
  })
}
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <ReviewSetSetupFields
          v-model:state="state"
          :transfer-payment-id="transferPaymentId"
          :stream-id="streamId"
          :entity-type-items="entityTypeItems" />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
