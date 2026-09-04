<script lang="ts" setup>
import type { ConfirmDialogProps } from '~~/shared/types/ui'

const {
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmColor = 'primary'
} = defineProps<ConfirmDialogProps>()

const { t } = useI18n()

const emits = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :dismissible="false">
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="cancelLabel || t('common.cancel')"
          color="neutral"
          variant="ghost"
          @click="emits('close', false)" />
        <UButton
          :label="confirmLabel || t('common.confirm')"
          :color="confirmColor"
          @click="emits('close', true)" />
      </div>
    </template>
  </UModal>
</template>
