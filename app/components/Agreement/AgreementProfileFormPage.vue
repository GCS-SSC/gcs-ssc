<script setup lang="ts">
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { computed, ref, shallowRef, unref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { Form, FormSchema } from '@nuxt/ui'
import type { z } from 'zod'
import {
  FundingCaseAgreementCreateSchema,
  FundingCaseAgreementGeneratedCreateSchema,
  FundingCaseAgreementProfileSchema
} from '~~/shared/types/schemas'
import type { AgreementFinancialNumberPolicy, FundingCaseAgreementProfileForm } from '~~/shared/types/funding-case-agreement-ui'
import { withFormRequirements } from '~~/shared/utils/form-requirements'

const {
  submitLabel,
  editorSession,
  cancelLabel,
  permissionAction,
  actionContext,
  agreementId,
  compact = false,
  pending = false,
  numberMode = 'manual',
  canKeepRatingAsManual = false,
  financialNumberPolicy
} = defineProps<{
  submitLabel: string
  editorSession: number
  cancelLabel: string
  permissionAction: 'create' | 'update'
  actionContext: ActionContext
  agreementId?: string
  compact?: boolean
  pending?: boolean
  canKeepRatingAsManual?: boolean
  numberMode?: 'manual' | 'generated' | null
  financialNumberPolicy?: AgreementFinancialNumberPolicy
}>()

const model = defineModel<FundingCaseAgreementProfileForm>('model', { required: true })

const emit = defineEmits<{
  (event: 'submit', riskSelectionChanged: boolean, acknowledgeRiskSelection: () => void): void
  (event: 'cancel'): void
}>()

const { createValidator } = useZodI18n()
const profileSchema = (): z.ZodType<Pick<FundingCaseAgreementProfileForm, 'egcs_fc_financialsystemnumber'>> => permissionAction === 'create'
  ? numberMode === 'generated' ? FundingCaseAgreementGeneratedCreateSchema : FundingCaseAgreementCreateSchema
  : FundingCaseAgreementProfileSchema
const validate = withFormRequirements((state: unknown) => {
  const schema = profileSchema()
  return createValidator(financialNumberPolicy?.required
    ? schema.refine(data => data.egcs_fc_financialsystemnumber != null, {
        error: 'validation.required',
        path: ['egcs_fc_financialsystemnumber']
      })
    : schema)(state)
}, profileSchema)
const validationState = computed(() => financialNumberPolicy?.value === undefined
  ? model.value
  : { ...model.value, egcs_fc_financialsystemnumber: financialNumberPolicy.value })

const formSession = ref(0)
const riskSelection = ref(0)
let nextRiskSelection = 0

/** Records an explicit rating selection, including a deliberate same-score save. */
const recordRiskSelection = () => {
  riskSelection.value = ++nextRiskSelection
}
watch(() => [editorSession, permissionAction, agreementId], () => {
  formSession.value += 1
  riskSelection.value = 0
}, { flush: 'sync' })
const formBinding = useFormSession({
  owner: {
    captureSession: () => formSession.value,
    isCurrentSession: session => session === formSession.value
  },
  action: { kind: 'remote', context: () => actionContext },
  /** Submits the current rating selection and acknowledges only that selection. */
  submit: () => {
    const selection = riskSelection.value
    emit('submit', selection !== 0, () => {
      if (riskSelection.value === selection) riskSelection.value = 0
    })
  }
})
const form = shallowRef<(ComponentPublicInstance & Pick<Form<FormSchema>, 'loading'>) | null>(null)
const submissionOwner = computed<{ submit: typeof formBinding.value.onSubmit | undefined }>(() => {
  void formSession.value
  return { submit: undefined }
})
// Nuxt Form starts loading before native, exposed-submit and nested validation.
watch(() => unref(form.value?.loading), loading => {
  submissionOwner.value.submit = loading ? formBinding.value.onSubmit : undefined
}, { flush: 'sync' })
// Authority changes retire validation without replacing the live dependent fields.
const renderedFormBinding = computed(() => {
  const owner = submissionOwner.value
  return {
    ...formBinding.value,
    key: formSession.value,
    /**
     * Settles validation captured by this rendered Form.
     * @param event - Validated native or exposed-submit event.
     * @returns The initiating Form's guarded submission.
     */
    onSubmit: (event: Event) => {
      const capturedSubmit = owner.submit
      owner.submit = undefined
      return capturedSubmit?.(event)
    }
  }
})
</script>

<template>
  <div data-help-view="agreement.profile-edit" data-help-label-en="Agreements — Profile editor" data-help-label-fr="Ententes — Éditeur du profil" :class="[compact ? 'mx-auto w-full max-w-4xl' : 'w-full']">
    <UForm
      v-bind="renderedFormBinding"
      ref="form"
      :state="validationState"
      :validate="validate"
      :validate-on="[]"
      :disabled="permissionAction === 'create' && pending"
      class="space-y-8">
      <fieldset :disabled="permissionAction === 'create' && pending" class="min-w-0 space-y-8">
        <AgreementFieldsAgreementProfileFields
          v-model:model="model"
          :agreement-id="agreementId"
          :permission-action="permissionAction"
          :financial-number-policy="financialNumberPolicy"
          :can-keep-rating-as-manual="canKeepRatingAsManual"
          :manual-rating-pending="riskSelection !== 0"
          :number-generated="permissionAction === 'create' && numberMode === 'generated'"
          @risk-selection="recordRiskSelection" />

        <AgreementFieldsAgreementApplicantRecipientsField
          v-if="permissionAction === 'create'"
          v-model:model="model.egcs_fc_applicantrecipients"
          :stream-id="model.egcs_fc_transferpaymentstream" />
      </fieldset>

      <div class="flex flex-col-reverse justify-end gap-3 border-t border-zinc-200 pt-6 sm:flex-row dark:border-zinc-800">
        <UButton
          data-help-target="agreement.profile-edit.cancel" data-help-kind="button"
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="emit('cancel')" />
        <CommonSaveButton data-help-target="agreement.profile-edit.save" data-help-kind="button" :label="submitLabel" :loading="pending" :disabled="pending || (permissionAction === 'create' && !!model.egcs_fc_transferpaymentstream && !numberMode)" />
      </div>
    </UForm>
  </div>
</template>
