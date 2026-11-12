<script setup lang="ts">
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { computed, ref, shallowRef, unref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { Form, FormSchema } from '@nuxt/ui'
import {
  FundingCaseAgreementCreateSchema,
  FundingCaseAgreementGeneratedCreateSchema,
  FundingCaseAgreementProfileSchema
} from '~~/shared/types/schemas'
import type { FundingCaseAgreementProfileForm } from '~~/shared/types/funding-case-agreement-ui'

const {
  submitLabel,
  editorSession,
  cancelLabel,
  permissionAction,
  actionContext,
  agreementId,
  compact = false,
  pending = false,
  numberMode = 'manual'
} = defineProps<{
  submitLabel: string
  editorSession: number
  cancelLabel: string
  permissionAction: 'create' | 'update'
  actionContext: ActionContext
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

const formSession = ref(0)
watch(() => [editorSession, permissionAction, agreementId], () => {
  formSession.value += 1
}, { flush: 'sync' })
const formBinding = useFormSession({
  owner: {
    captureSession: () => formSession.value,
    isCurrentSession: session => session === formSession.value
  },
  action: { kind: 'remote', context: () => actionContext },
  submit: () => emit('submit')
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
      :state="model"
      :validate="validate"
      :validate-on="[]"
      :disabled="permissionAction === 'create' && pending"
      class="space-y-8">
      <fieldset :disabled="permissionAction === 'create' && pending" class="min-w-0 space-y-8">
        <AgreementFieldsAgreementProfileFields
          v-model:model="model"
          :agreement-id="agreementId"
          :permission-action="permissionAction"
          :number-generated="permissionAction === 'create' && numberMode === 'generated'" />

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
