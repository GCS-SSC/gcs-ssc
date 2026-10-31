<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed } from 'vue'
import type { z } from 'zod'

const { state, schema, title, submitLabel, pending = false, footerClass = 'pt-4' } = defineProps<{
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
</script>

<template>
  <UModal v-if="state" v-model:open="open" :title="title">
    <template #body>
      <UForm :state="state" :validate="validate" class="space-y-4" @submit="emit('submit')">
        <slot :state="state" />
        <div class="flex justify-end gap-2" :class="footerClass">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" @click="open = false" />
          <CommonSaveButton :label="submitLabel" :loading="pending" :disabled="pending" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
