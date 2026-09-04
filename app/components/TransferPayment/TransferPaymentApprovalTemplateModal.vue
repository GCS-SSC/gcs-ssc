<script setup lang="ts">
import type { ApprovalTemplate } from '~~/shared/types/schemas'
import type { CrudModalSession } from '~/composables/useCrudModal'

const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })
const state = defineModel<(ApprovalTemplate & { id?: string }) | null>('state', { required: true })

const { streamId, captureSession, closeSession } = defineProps<{
  transferPaymentId: string
  streamId: string
  captureSession: () => CrudModalSession | null
  closeSession: (session: CrudModalSession | null) => boolean
}>()
</script>

<template>
  <CommonApprovalTemplatesModal
    v-model:open="open"
    v-model:state="state"
    scope-type="transferpaymentstream"
    :scope-id="streamId"
    :capture-session="captureSession"
    :close-session="closeSession"
    @saved="emit('saved')" />
</template>
