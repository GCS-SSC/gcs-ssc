<script setup lang="ts">
import { approvalAttachmentUrl } from './attachments'
import type { ApprovalAttachment } from './attachments'

const { approvalId, items, canRemove = false, disabled = false } = defineProps<{
  approvalId: string
  items: ApprovalAttachment[]
  canRemove?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ remove: [attachmentId: string] }>()
const { t } = useI18n()
</script>

<template>
  <ul class="divide-y divide-default" :aria-label="t('attachments.title')">
    <li v-for="item in items" :key="item.id" class="flex items-center gap-2 py-2">
      <div class="min-w-0 flex-1">
        <a
          class="block break-words text-primary underline underline-offset-2"
          :href="`${approvalAttachmentUrl(approvalId, item.id)}/download`"
          :download="item.filename">
          {{ item.filename }}
        </a>
        <div class="text-sm text-muted">
          <CommonBilingualName :name-en="item.typeNameEn" :name-fr="item.typeNameFr" />
        </div>
      </div>
      <UButton
        v-if="canRemove"
        type="button"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        :aria-label="t('attachments.remove_named', { name: item.filename })"
        :disabled="disabled"
        @click="emit('remove', item.id)" />
    </li>
  </ul>
</template>
