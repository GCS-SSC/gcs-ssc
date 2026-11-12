<script setup lang="ts">
import { watch } from 'vue'
import { useModalSession } from '~/composables/useModalSession'
import { useFormSession } from '~/composables/useFormSession'
import type { ActionContext } from '~/composables/useActionContext'
import { UserProfileSchema, type UserProfileItem } from '~~/shared/types/schemas'

const { title, submitLabel, pending = false, actionContext } = defineProps<{
  title: string
  submitLabel: string
  pending?: boolean
  actionContext: ActionContext
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<UserProfileItem>>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(UserProfileSchema)

const onSubmit = () => {
  if (pending) return
  emit('submit')
}

const modalSession = useModalSession()
watch([open, state], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value
}, { immediate: true, flush: 'sync' })
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: onSubmit })
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('user.description')" data-field-scope="user.modal" data-field-tooltip-unavailable="No owning agency is resolved for this administration screen.">
    <template #body>
      <UForm :disabled="pending" :state="state" :validate="validate" class="space-y-4" v-bind="formSession">
        <UFormField :label="t('role.assignment.user')" name="name">
          <UInput v-model="state.name" />
        </UFormField>
        <UFormField :label="t('user.email')" name="email">
          <UInput v-model="state.email" type="email" />
        </UFormField>
        <UFormField :label="t('user.image_url')" name="image">
          <UInput v-model.nullable="state.image" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
