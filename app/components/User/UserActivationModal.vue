<script setup lang="ts">
import { UserActivationSchema, type UserActivation } from '~~/shared/types/schemas/user'

const { pending = false } = defineProps<{
  pending?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<Partial<UserActivation>>('state', { required: true })
const emit = defineEmits(['submit'])

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = createValidator(UserActivationSchema)
</script>

<template>
  <UModal v-model:open="open" :title="t('user.activate_title')" :description="t('user.activate_description')">
    <template #body>
      <UForm v-if="state" :state="state" :validate="validate" class="space-y-4" @submit="emit('submit')">
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          {{ t('user.activate_description') }}
        </p>
        <UFormField :label="t('login.password')" name="password">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('login.password_placeholder')" />
        </UFormField>
        <div class="flex justify-end gap-2 pt-4">
          <UButton
            :label="t('common.cancel')"
            color="neutral"
            variant="ghost"
            :disabled="pending"
            @click="open = false" />
          <CommonSaveButton
            :label="t('user.activate')"
            icon="i-lucide-user-check"
            :loading="pending"
            :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
