<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

const { proponentId, streamId, agreementId, permissionAction = 'create', name = 'egcs_fc_applicantrecipientsubtype', label } = defineProps<{
  proponentId?: string
  streamId?: string
  agreementId?: string
  permissionAction?: 'create' | 'update'
  name?: string
  label?: string
}>()
const model = defineModel<string | null>()
const { t } = useI18n()
const { showError } = useApiErrorToast()
const fixed: Ref<string | null> = ref(null)
const loading: Ref<boolean> = ref(false)
const savedType: Ref<string | null> = ref(model.value ?? null)
const eligibleIds: Ref<string[]> = ref([])
const excludedTypes = computed(() => fixed.value
  ? eligibleIds.value.filter(id => id !== fixed.value && id !== savedType.value)
  : [])
const query = computed(() => ({
  proponent_id: proponentId ?? '',
  ...(agreementId ? { agreement_id: agreementId } : { stream_id: streamId ?? '' }),
  permission_action: permissionAction
}))
watch(() => [proponentId, streamId, agreementId], async (_value, previous, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  if (previous?.length) {
    model.value = undefined
    savedType.value = null
  }
  eligibleIds.value = []
  fixed.value = null
  loading.value = false
  if (!proponentId || (!streamId && !agreementId)) return
  loading.value = true
  try {
    const result = await $fetch<{ suggested: string | null; fixed: string | null; items: Array<{ id: string }> }, string>('/api/agreements/lookups/proponent-types', {
      query: query.value, signal: controller.signal
    })
    if (controller.signal.aborted) return
    fixed.value = result.fixed
    eligibleIds.value = result.items.map(item => item.id)
    if (!model.value) model.value = result.suggested
  } catch (error) {
    if (!controller.signal.aborted) showError(error)
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <UFormField :name="name" :label="label ?? t('agreement.applicant_recipients.type')" required>
    <CommonServerLookupSelect
      v-if="proponentId && (streamId || agreementId)"
      :model-value="model ?? undefined"
      fetch-url="/api/agreements/lookups/proponent-types"
      :query="query"
      value-key="id"
      label-en-key="egcs_ay_name_en"
      label-fr-key="egcs_ay_name_fr"
      :exclude-values="excludedTypes"
      :disabled="loading || (!!fixed && (!savedType || savedType === fixed))"
      :placeholder="t('agreement.applicant_recipients.not_selected')"
      @update:model-value="model = $event" />
    <USelectMenu v-else disabled :placeholder="t('agreement.applicant_recipients.not_selected')" />
  </UFormField>
</template>
