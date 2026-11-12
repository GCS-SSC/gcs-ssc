<script setup lang="ts">
import type { ActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import { ref, watch } from 'vue'
import { ApplicantRecipientProfileSchema } from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileForm, ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'

const {
  actionContext,
  submitLabel,
  editorSession,
  cancelLabel,
  leadAgencyPermissionAction,
  pending = false,
  persistedProfile
} = defineProps<{
  actionContext: ActionContext
  submitLabel: string
  editorSession: number
  cancelLabel: string
  leadAgencyPermissionAction: 'create' | 'update'
  pending?: boolean
  persistedProfile?: ApplicantRecipientProfileRow
}>()

const model = defineModel<ApplicantRecipientProfileForm>('model', { required: true })

const emit = defineEmits<{
  (event: 'submit' | 'cancel' | 'unavailable'): void
}>()

const { createValidator } = useZodI18n()
const validate = createValidator(ApplicantRecipientProfileSchema)

const formSession = ref(0)
watch([() => editorSession, () => leadAgencyPermissionAction, () => persistedProfile?.id], () => {
  formSession.value += 1
}, { flush: 'sync' })
const formBinding = useFormSession({
  owner: {
    captureSession: () => formSession.value,
    isCurrentSession: session => session === formSession.value
  },
  action: { kind: 'remote', context: () => actionContext },
  onDenied: () => emit('unavailable'),
  submit: () => emit('submit')
})
</script>

<template>
  <div data-help-view="proponent.profile" class="w-full">
    <UForm v-bind="formBinding" :state="model" :validate="validate" :disabled="leadAgencyPermissionAction === 'create' && pending" class="space-y-8">
      <ApplicantRecipientFieldsApplicantRecipientProfileFields
        v-model:model="model"
        :persisted-profile="persistedProfile"
        :lead-agency-permission-action="leadAgencyPermissionAction" />

      <div class="flex flex-col-reverse justify-end gap-3 border-t border-zinc-200 pt-6 sm:flex-row dark:border-zinc-800">
        <UButton
          data-help-target="proponent.profile.cancel" data-help-kind="button"
          color="neutral"
          variant="ghost"
          :label="cancelLabel"
          :disabled="pending"
          @click="emit('cancel')" />
        <CommonSaveButton data-help-target="proponent.profile.save" data-help-kind="button" :label="submitLabel" :loading="pending" :disabled="pending" />
      </div>
    </UForm>
  </div>
</template>
