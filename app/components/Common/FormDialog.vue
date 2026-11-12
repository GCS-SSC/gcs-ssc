<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed, watch } from 'vue'
import { useFormSession } from '~/composables/useFormSession'
import { useModalSession } from '~/composables/useModalSession'
import type { ActionContext } from '~/composables/useActionContext'
import type { z } from 'zod'

const { actionContext, state, schema, title, submitLabel, pending = false, footerClass = 'pt-4' } = defineProps<{
  actionContext: ActionContext
  state: T | null
  schema: z.ZodType
  title: string
  submitLabel: string
  pending?: boolean
  footerClass?: string
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [] }>()
defineSlots<{ default(props: { state: T }): unknown }>()

const { t } = useI18n()
const { createValidator } = useZodI18n()
const validate = computed(() => createValidator(schema))
const modalSession = useModalSession()
watch([open, () => state], () => {
  modalSession.isOpen.value = false
  modalSession.isOpen.value = open.value && state !== null
}, { immediate: true, flush: 'sync' })
const formSession = useFormSession({ owner: modalSession, action: { kind: 'remote', context: () => actionContext }, submit: () => emit('submit') })
</script>

<template>
  <UModal v-if="state" v-model:open="open" :title="title">
    <template #body>
      <UForm v-bind="formSession" :state="state" :validate="validate" :disabled="pending" class="space-y-4">
        <slot :state="state" />
        <div class="flex justify-end gap-2" :class="footerClass">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
