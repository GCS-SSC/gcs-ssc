<script setup lang="ts">
import { computed } from 'vue'
import {
  useTransferPaymentReviewSetupModal,
  type ReviewSetupFormState
} from '~/composables/useTransferPaymentReviewSetupModal'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<ReviewSetupFormState | null>('state', { required: true })

const { transferPaymentId, streamId, captureSession, closeSession } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
} & CrudModalSessionLifecycle>()

const { t } = useI18n()
const entityTypeDisabled = computed(() => !state.value?.id && Boolean(state.value?.egcs_cn_entitytype))
if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentReviewSetupModal requires captureSession and closeSession together')
}
const sessionLifecycle = captureSession
  ? { captureSession, closeSession }
  : { captureSession: undefined, closeSession: undefined }
const {
  validate,
  isSubmitting,
  modalTitle,
  submitLabel,
  transferPaymentEntityTypeItems,
  onSubmit
} = useTransferPaymentReviewSetupModal({
  open,
  state,
  transferPaymentId,
  streamId,
  emitSaved: () => emit('saved'),
  ...sessionLifecycle
})
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <ReviewSetSetupFields
          v-model:state="state"
          :transfer-payment-id="transferPaymentId"
          :stream-id="streamId"
          :entity-type-disabled="entityTypeDisabled"
          :entity-type-items="transferPaymentEntityTypeItems" />

        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
