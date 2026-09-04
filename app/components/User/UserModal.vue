<script setup lang="ts">
import { UserProfileSchema, type UserProfileItem } from '~~/shared/types/schemas'

const { title, submitLabel, pending = false } = defineProps<{
  title: string
  submitLabel: string
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<UserProfileItem>>('state', { required: true })

const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(UserProfileSchema)

const onSubmit = () => {
  emit('submit')
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="t('user.description')">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('role.assignment.user')" name="name">
          <UInput v-model="state.name" />
        </UFormField>
        <UFormField :label="t('user.email')" name="email">
          <UInput v-model="state.email" type="email" />
        </UFormField>
        <UFormField :label="t('user.image_url')" name="image">
          <UInput v-model="state.image" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
