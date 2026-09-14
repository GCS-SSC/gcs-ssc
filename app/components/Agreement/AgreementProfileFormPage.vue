<script setup lang="ts">
import { computed } from 'vue'
import {
  FundingCaseAgreementCreateSchema,
  FundingCaseAgreementGeneratedCreateSchema,
  FundingCaseAgreementProfileSchema
} from '~~/shared/types/schemas'
import type { FundingCaseAgreementProfileForm } from '~~/shared/types/funding-case-agreement-ui'

const {
  submitLabel,
  cancelLabel,
  permissionAction,
  agreementId,
  compact = false,
  pending = false,
  numberMode = 'manual'
} = defineProps<{
  submitLabel: string
  cancelLabel: string
  permissionAction: 'create' | 'update'
  agreementId?: string
  compact?: boolean
  pending?: boolean
  numberMode?: 'manual' | 'generated' | null
}>()

const model = defineModel<FundingCaseAgreementProfileForm>('model', { required: true })

const emit = defineEmits<{
  (event: 'submit' | 'cancel'): void
}>()

const { createValidator } = useZodI18n()
const validate = computed(() => createValidator(permissionAction === 'create'
  ? numberMode === 'generated' ? FundingCaseAgreementGeneratedCreateSchema : FundingCaseAgreementCreateSchema
  : FundingCaseAgreementProfileSchema))

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
        :permission-action="permissionAction"
        :number-generated="permissionAction === 'create' && numberMode === 'generated'" />

      <AgreementFieldsAgreementApplicantRecipientsField
        v-if="permissionAction === 'create'"
        v-model:model="model.applicant_recipient_ids" />

      <div class="flex flex-col-reverse justify-end gap-3 border-t border-zinc-200 pt-6 sm:flex-row dark:border-zinc-800">
        <UButton
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="emit('cancel')" />
        <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending || (permissionAction === 'create' && !!model.egcs_fc_transferpaymentstream && !numberMode)" />
      </div>
    </UForm>
  </div>
</template>
