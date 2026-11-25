<script setup lang="ts">
import { ref, watch } from 'vue'
import { z } from 'zod'
import { ofetch } from 'ofetch'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { useActionContext } from '~/composables/useActionContext'
import { useModalSession } from '~/composables/useModalSession'
import type { PortableAuthoringKind, PortableAuthoringNotice } from '~~/shared/utils/portable-authoring-schema'

const { agencyId, kind, canGenerate } = defineProps<{ agencyId: string; kind: PortableAuthoringKind; canGenerate: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ generated: [envelope: unknown, notices: PortableAuthoringNotice[]] }>()
const { t } = useI18n()
const session = useModalSession()
const action = useActionContext({ identity: [() => agencyId, () => kind], authority: () => canGenerate })
const file = ref<File | null>(null)
const phase = ref<{ kind: 'ready' } | { kind: 'pending' } | { kind: 'error'; message: string }>({ kind: 'ready' })
const inFlight = ref(false)
const apiError = z.object({ data: z.object({ data: z.object({ message: z.string() }) }) })

watch([open, action.version], ([visible]) => {
  session.isOpen.value = false
  session.isOpen.value = visible
  file.value = null
  phase.value = { kind: 'ready' }
}, { immediate: true, flush: 'sync' })

const selectFile = (event: Event) => {
  if (event.target instanceof HTMLInputElement) file.value = event.target.files?.[0] ?? null
}

/** Converts the selected source for the current modal opening. */
const generate = async () => {
  const owner = action.capture()
  const opening = session.captureSession()
  if (!owner?.canDispatch() || !opening || !file.value || inFlight.value) return
  const body = new FormData()
  body.append('file', file.value)
  const url = getClientRequestUrl(`/api/agency/${encodeURIComponent(agencyId)}/authoring-generation/${kind}`).toString()
  inFlight.value = true
  phase.value = { kind: 'pending' }
  try {
    const result = await ofetch<{ envelope: unknown; notices: PortableAuthoringNotice[] }>(url, { method: 'POST', body })
    if (!owner.isCurrent() || !session.isCurrentSession(opening)) return
    open.value = false
    emit('generated', result.envelope, result.notices)
  } catch (error) {
    if (!owner.isCurrent() || !session.isCurrentSession(opening)) return
    const parsed = apiError.safeParse(error)
    phase.value = { kind: 'error', message: parsed.data?.data.data.message ?? t('authoring_generation.provider_failed') }
  } finally {
    inFlight.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('authoring_generation.title')" :description="t('authoring_generation.disclosure')" :dismissible="phase.kind !== 'pending'">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('authoring_generation.file')" required data-field-exclude="Transient source file for generation">
          <UInput type="file" class="w-full" :disabled="phase.kind === 'pending'" @change="selectFile" />
        </UFormField>
        <CommonNotice v-if="phase.kind === 'error'" tone="error" :title="phase.message" role="alert" />
        <p v-if="phase.kind === 'pending'" role="status">
          {{ t('authoring_generation.pending') }}
        </p>
      </div>
    </template>
    <template #footer>
      <UButton :disabled="!file || inFlight || !canGenerate" :loading="phase.kind === 'pending'" :label="t('authoring_generation.generate')" @click="generate" />
    </template>
  </UModal>
</template>
