<script setup lang="ts">
import { computed } from 'vue'
import {
  FundingCaseAgreementCreateSchema,
  FundingCaseAgreementProfileSchema
} from '~~/shared/types/schemas'
import type { FundingCaseAgreementProfileForm } from '~~/shared/types/funding-case-agreement-ui'

const {
  submitLabel,
  cancelLabel,
  permissionAction,
  agreementId,
  compact = false,
  pending = false
} = defineProps<{
  submitLabel: string
  cancelLabel: string
  permissionAction: 'create' | 'update'
  agreementId?: string
  compact?: boolean
  pending?: boolean
}>()

const model = defineModel<FundingCaseAgreementProfileForm>('model', { required: true })

const emit = defineEmits<{
  (event: 'submit' | 'cancel'): void
}>()

const { createValidator } = useZodI18n()
const selectedStreamId = computed(() => {
  if (!model.value.egcs_fc_transferpaymentstream) {
    return ''
  }

  return String(model.value.egcs_fc_transferpaymentstream)
})
const validate = createValidator(permissionAction === 'create' ? FundingCaseAgreementCreateSchema : FundingCaseAgreementProfileSchema)

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <div :class="[compact ? 'mx-auto w-full max-w-7xl py-4' : 'w-full py-6']">
    <UForm
      :state="model"
      :validate="validate"
      :validate-on="[]"
      class="space-y-8"
      @submit="onSubmit">
      <AgreementFieldsAgreementProfileFields
        v-model:model="model"
        :agreement-id="agreementId"
        :permission-action="permissionAction" />

      <AgreementFieldsAgreementApplicantRecipientsField
        v-if="permissionAction === 'create'"
        v-model:model="model.applicant_recipient_ids"
        :stream-id="selectedStreamId" />

      <div class="flex flex-col-reverse justify-end gap-3 border-t border-zinc-200 pt-6 sm:flex-row dark:border-zinc-800">
        <UButton
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="emit('cancel')" />
        <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
      </div>
    </UForm>
  </div>
</template>
