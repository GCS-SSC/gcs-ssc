<script setup lang="ts">
import { useTransferPaymentRecommendationSetupModal } from '~/composables/useTransferPaymentRecommendationSetupModal'
import type { Ref } from 'vue'
import type { TransferPaymentStreamRecommendationSetupItem } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state: Ref<Partial<TransferPaymentStreamRecommendationSetupItem> | null> = defineModel<Partial<TransferPaymentStreamRecommendationSetupItem> | null>('state', { default: null })

const { transferPaymentId, streamId, agencyId, captureSession, closeSession } = defineProps<{
  transferPaymentId: string
  streamId: string
  agencyId?: string
} & CrudModalSessionLifecycle>()

const { t } = useI18n()
if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('TransferPaymentRecommendationSetupModal requires captureSession and closeSession together')
}
const sessionLifecycle = captureSession
  ? { captureSession, closeSession }
  : { captureSession: undefined, closeSession: undefined }
const {
  validate,
  isSubmitting,
  modalTitle,
  submitLabel,
  onSubmit
} = useTransferPaymentRecommendationSetupModal({
  open,
  state,
  transferPaymentId,
  streamId,
  agencyId,
  emitSaved: () => emit('saved'),
  ...sessionLifecycle
})
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('transfer_payment.name_en')" name="egcs_cn_name_en">
          <UInput v-model="state.egcs_cn_name_en" />
        </UFormField>
        <UFormField :label="t('transfer_payment.name_fr')" name="egcs_cn_name_fr">
          <UInput v-model="state.egcs_cn_name_fr" />
        </UFormField>
        <UFormField :label="t('transfer_payment.description_en')" name="egcs_cn_description_en">
          <CommonTextarea v-model="state.egcs_cn_description_en" />
        </UFormField>
        <UFormField :label="t('transfer_payment.description_fr')" name="egcs_cn_description_fr">
          <CommonTextarea v-model="state.egcs_cn_description_fr" />
        </UFormField>
        <AdminCommonLookupField
          v-model="state.egcs_cn_approvaltemplate"
          :label="t('workflow.source_approval_template')"
          name="egcs_cn_approvaltemplate"
          fetch-url="/api/approval-templates"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
          :query="{ scopeType: 'transferpaymentstream', scopeId: streamId }" />
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
