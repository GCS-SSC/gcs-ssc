<script setup lang="ts">
import { useAgencyRecommendationSetModal } from '~/composables/useAgencyRecommendationSetModal'
import type { Ref } from 'vue'
import type { ActionContext } from '~/composables/useActionContext'
import type { CaptureCommittedSettlement } from '~/composables/useCommittedSettlement'
import type { TransferPaymentStreamRecommendationSetupItem } from '~~/shared/types/schemas/transfer-payment'
import type { CrudModalSessionLifecycle } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state: Ref<Partial<TransferPaymentStreamRecommendationSetupItem> | null> = defineModel<Partial<TransferPaymentStreamRecommendationSetupItem> | null>('state', { default: null })

const { agencyId, captureSession, closeSession, actionContext, captureCommitted } = defineProps<{
  agencyId: string
  actionContext: ActionContext
  captureCommitted: CaptureCommittedSettlement
} & CrudModalSessionLifecycle>()

const { t } = useI18n()
if (Boolean(captureSession) !== Boolean(closeSession)) {
  throw new Error('AgencyRecommendationSetModal requires captureSession and closeSession together')
}
const sessionLifecycle = captureSession
  ? { captureSession, closeSession }
  : { captureSession: undefined, closeSession: undefined }
const {
  formSession,
  validate,
  isSubmitting,
  modalTitle,
  submitLabel
} = useAgencyRecommendationSetModal({
  open,
  state,
  agencyId: () => agencyId,
  actionContext: () => actionContext,
  captureCommitted,
  emitSaved: () => emit('saved'),
  ...sessionLifecycle
})
</script>

<template>
  <UModal v-model:open="open" :title="modalTitle" data-field-scope="agency.recommendation-set-modal">
    <template #body>
      <UForm v-if="state" v-bind="formSession" :state="state" :validate="validate" :disabled="isSubmitting" class="space-y-4">
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
          v-if="agencyId"
          v-model="state.egcs_cn_approvaltemplate"
          :label="t('workflow.source_approval_template')"
          name="egcs_cn_approvaltemplate"
          :fetch-url="`/api/agency/${agencyId}/approval-templates`" :include-deleted-query="false"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
        />
        <div class="flex justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="isSubmitting" :disabled="isSubmitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
