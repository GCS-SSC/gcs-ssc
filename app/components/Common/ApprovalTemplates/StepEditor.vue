<script setup lang="ts">
import type { ApprovalTemplateEditorStep } from '~/types/approval-template-editor'

const open = defineModel<boolean>('open', { default: false })
const step = defineModel<ApprovalTemplateEditorStep | null>('step', { required: true })

const { mode, approvalTemplateId } = defineProps<{
  mode: 'create' | 'edit'
  approvalTemplateId: string
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useI18n()

const modalTitle = computed(() => mode === 'create' ? t('common.add') : t('common.edit'))

const closeEditor = () => {
  open.value = false
  emit('cancel')
}

const saveEditor = () => {
  open.value = false
  emit('save')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :description="t('admin_common.resources.approval_steps')"
    fullscreen
    :ui="{ content: 'rounded-none shadow-none ring-0' }">
    <template #body>
      <div v-if="step" class="flex h-full flex-col">
        <div class="flex-1 overflow-y-auto p-6 lg:p-8">
          <div class="mx-auto w-full max-w-6xl space-y-8 pb-12">
            <CommonApprovalTemplatesStepFields v-model:step="step" :approval-template-id="approvalTemplateId" />
          </div>
        </div>

        <div class="border-default flex items-center justify-end gap-3 border-t bg-white px-6 py-4 dark:bg-zinc-950 lg:px-8">
          <UButton :label="t('common.cancel')" color="neutral" variant="ghost" class="cursor-default" @click="closeEditor" />
          <CommonSaveButton :label="t('common.save')" class="cursor-default" @click="saveEditor" />
        </div>
      </div>
    </template>
  </UModal>
</template>
