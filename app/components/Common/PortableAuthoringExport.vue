<script setup lang="ts">
import { ref } from 'vue'
import { ofetch } from 'ofetch'
import { createPortableAuthoringExport, type PortableAuthoringKind } from '~~/shared/utils/portable-authoring-schema'
import { useActionContext } from '~/composables/useActionContext'
import { getClientRequestUrl } from '~/utils/client-request-url'

const { endpoint, kind } = defineProps<{ endpoint: string; kind: PortableAuthoringKind }>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const pending = ref(false)
const context = useActionContext({ identity: [() => endpoint, () => kind], authority: () => Boolean(endpoint) })

/** Downloads the saved definition and leaves any in-progress editor changes local. */
const download = async () => {
  const action = context.capture()
  if (!action?.canDispatch() || pending.value) return
  pending.value = true
  try {
    const record = await ofetch<Record<string, unknown>>(getClientRequestUrl(endpoint).toString())
    if (!action.isCurrent()) return
    const schema = createPortableAuthoringExport(kind, record)
    const bytes = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(bytes)
    const link = document.createElement('a')
    link.href = url
    link.download = `${kind}-schema.json`
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    if (action.isCurrent()) showError(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UButton
    :label="t('portable_authoring.export')"
    icon="i-lucide-download"
    color="neutral"
    variant="outline"
    :loading="pending"
    @click="download" />
</template>
