<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useResourceRequest } from '~/composables/useResourceRequest'

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
const savedType: Ref<string | null> = ref(model.value ?? null)
const excludedTypes = computed(() => fixed.value
  ? eligibleIds.value.filter(id => id !== fixed.value && id !== savedType.value)
  : [])
const query = computed(() => ({
  proponent_id: proponentId ?? '',
  ...(agreementId ? { agreement_id: agreementId } : { stream_id: streamId ?? '' }),
  permission_action: permissionAction
}))
watch(() => [proponentId, streamId, agreementId], () => {
  model.value = undefined
  savedType.value = null
}, { flush: 'sync' })
const request = useResourceRequest({
  identity: () => JSON.stringify([proponentId, streamId, agreementId, permissionAction]),
  enabled: () => Boolean(proponentId && (streamId || agreementId)),
  refreshData: 'clear',
  failureData: 'clear',
  load: signal => $fetch<{ suggested: string | null; fixed: string | null; items: Array<{ id: string }> }, string>('/api/agreements/lookups/proponent-types', {
    query: query.value, signal
  })
})
const fixed = computed(() => request.data.value?.fixed ?? null)
const eligibleIds = computed(() => request.data.value?.items.map(item => item.id) ?? [])
const loading = computed(() => request.status.value === 'pending')
watch(request.data, result => {
  if (result && !model.value) model.value = result.suggested
})
watch(request.error, error => {
  if (error) showError(error)
})
</script>

<template>
  <UFormField :name="name" :label="label ?? t('agreement.applicant_recipients.type')" required data-ui-target="agreement.proponent-type-field.name" data-field-tooltip-context="agreement" data-field-scope="agreement.proponent-type-field" data-scope-label-en="Agreements > Proponents" data-scope-label-fr="Ententes > Promoteurs">
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
