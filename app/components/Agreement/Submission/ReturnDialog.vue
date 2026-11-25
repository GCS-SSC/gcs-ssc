<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import type { Form, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { useActionContext } from '~/composables/useActionContext'
import { useFormSession } from '~/composables/useFormSession'
import type { useSubmissionReturn } from '~/composables/useSubmissionReturn'

const { editor, busy, disabled } = defineProps<{
  editor: ReturnType<typeof useSubmissionReturn>
  busy: boolean
  disabled: boolean
}>()
const emit = defineEmits<{ confirm: [description: string] }>()
const { t } = useI18n()
const { createValidator } = useZodI18n()

type ReturnDraft = typeof editor.draft
const form = useTemplateRef<Form<ReturnDraft>>('form')
const validate = createValidator(z.object({
  description: z.string({ error: 'validation.required' }).trim().min(1, { error: 'validation.required' })
}))
const editorRevision = ref(0)
watch([() => editor, () => editor.context.version.value], () => {
  editorRevision.value += 1
}, { flush: 'sync' })
const context = useActionContext({
  identity: [editorRevision],
  authority: () => Boolean(editor.context.capture()),
  eligible: () => editor.eligible.value && !disabled && !busy
})
const formSession = useFormSession<FormSubmitEvent<ReturnDraft>>({
  owner: {
    captureSession: () => editor.session.captureSession(),
    isCurrentSession: session => editor.session.isCurrentSession(session)
  },
  action: { kind: 'remote', context },
  submit: event => emit('confirm', event.data.description.trim())
})

watch(() => editor.draft.description, () => form.value?.clear('description'))

/** Dismisses the current draft after any admitted command has settled. */
const dismiss = () => {
  if (!busy) editor.close()
}
</script>

<template>
  <UModal
    :open="editor.session.isOpen.value"
    :title="t('submission.return')"
    :dismissible="!busy"
    :close="!busy"
    @update:open="$event || dismiss()">
    <template #default>
      <slot name="trigger" />
    </template>
    <template #body>
      <UForm
        ref="form"
        v-bind="formSession"
        :state="editor.draft"
        :validate="validate"
        :validate-on="[]"
        :disabled="busy"
        class="space-y-4">
        <slot />
        <div class="flex justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" :disabled="busy" @click="dismiss">
            {{ t('common.cancel') }}
          </UButton>
          <UButton type="submit" color="warning" :loading="busy" :disabled="disabled">
            {{ t('submission.confirm_return') }}
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
