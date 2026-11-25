<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useResourceRequest } from '~/composables/useResourceRequest'
import CommonSection from '~/components/Common/Section.vue'
import AgreementFieldsCustomField from './CustomField.vue'
import { useCatalogCacheRefresh } from '~/composables/useCatalogCacheRefresh'
import { getClientRequestUrl } from '~/utils/client-request-url'
import { throwFetchResponseError } from '~/utils/fetch-error'
import { customFieldHasValue, customFieldOptionIds } from '~~/shared/types/schemas/agreement-custom-fields'
import type { AgreementCustomFieldSection, AssignedAgencyCustomFieldDefinition, AgreementCustomFieldPatch } from '~~/shared/types/schemas/agreement-custom-fields'

const { streamId, agreementId, activity, currency, placement = 'all', readonly = false, permissionAction = 'create' } = defineProps<{
  streamId?: string
  agreementId?: string
  currency?: string
  activity?: { agreementId: string; amendmentId?: string }
  placement?: 'all' | 'profile' | 'configured'
  readonly?: boolean
  permissionAction?: 'create' | 'update' | 'read'
}>()
const model = defineModel<AgreementCustomFieldPatch>({ default: () => ({}) })
const { t, locale } = useI18n()
const { showError } = useApiErrorToast()
const catalogUrl = computed(() => {
  const query = new URLSearchParams({ permission_action: permissionAction })
  if (activity) {
    if (activity.amendmentId) query.set('amendment_id', activity.amendmentId)
    return `/api/agreements/${encodeURIComponent(activity.agreementId)}/activities/lookups/custom-fields?${query}`
  }
  if (streamId) query.set('stream_id', streamId)
  if (agreementId) query.set('agreement_id', agreementId)
  return `/api/agreements/lookups/custom-fields?${query}`
})
const { user, permissionRevision } = useAuth()
const identity = computed(() => JSON.stringify([catalogUrl.value, user.value?.id, permissionRevision.value]))
type Catalog = { items: AssignedAgencyCustomFieldDefinition[]; sections: AgreementCustomFieldSection[] }
const { data, status, error, refresh, reset } = useResourceRequest<Catalog>({
  identity,
  enabled: () => Boolean(user.value?.id),
  /** @param signal - Cancellation for this catalog identity.
   * @returns The current authorized field catalog.
   */
  load: async signal => {
    const response = await fetch(getClientRequestUrl(catalogUrl.value), { signal })
    if (!response.ok) await throwFetchResponseError(response)
    return await response.json()
  }
})
const history = shallowRef<{ identity: string; catalog: Catalog } | null>(null)
const currentHistory = computed(() => history.value?.identity === identity.value ? history.value.catalog : null)

watch([identity, data], ([key, current], [previousKey, previous]) => {
  if (key !== previousKey) history.value = null
  if (!current || !previous || key !== previousKey) return
  const fields = new Map(currentHistory.value?.items.map(field => [field.id, field]))
  for (const field of previous.items) {
    const options = [...(fields.get(field.id)?.options ?? []), ...field.options]
    fields.set(field.id, { ...field, options: [...new Map(options.map(option => [option.id, option])).values()] })
  }
  const sections = [...(currentHistory.value?.sections ?? []), ...previous.sections]
  history.value = {
    identity: key,
    catalog: {
      items: [...fields.values()].filter(field => customFieldHasValue(model.value[field.id])),
      sections: [...new Map(sections.map(section => [section.id, section])).values()]
    }
  }
}, { flush: 'sync' })

const { check: checkCatalogVersions, checking: checkingCatalog, failed: catalogCheckFailed } = useCatalogCacheRefresh(catalogUrl, change => {
  if (change.securityContextChanged) {
    history.value = null
    reset()
    if (!user.value?.id) return
  }
  return refresh()
}, showError)
const retryFields = async () => {
  const key = identity.value
  if (await checkCatalogVersions() && key === identity.value) await refresh()
}
const fields = computed(() => {
  const current = data.value?.items ?? []
  if (activity) return current.filter(field => (!readonly && field.egcs_tp_active) || customFieldHasValue(model.value[field.id]))
  const currentIds = new Set(current.map(field => field.id))
  const historical = (currentHistory.value?.items ?? []).filter(field => !currentIds.has(field.id) && customFieldHasValue(model.value[field.id]))
    .map(field => ({ ...field, egcs_tp_active: false }))
  return [...current, ...historical].filter(field => field.egcs_tp_active || customFieldHasValue(model.value[field.id]))
})
const sections = computed(() => {
  const sectionDefinitions = [...new Map([...(currentHistory.value?.sections ?? []), ...(data.value?.sections ?? [])].map(section => [section.id, section])).values()]
  const grouped = sectionDefinitions.map(section => ({ ...section, fields: fields.value.filter(field => field.egcs_tp_section === section.id) }))
  const unsectioned = fields.value.filter(field => field.egcs_tp_section === null)
  if (placement !== 'configured' && unsectioned.length) grouped.push({ id: 'unsectioned', egcs_tp_name_en: t('custom_fields.title'), egcs_tp_name_fr: t('custom_fields.title'), egcs_tp_displayorder: 0, egcs_tp_beforeentity: false, fields: unsectioned })
  return grouped.filter(section => section.fields.length && (placement !== 'profile' || section.id === 'unsectioned'))
})
const sectionLabel = (value: { egcs_tp_name_en: string, egcs_tp_name_fr: string }) => locale.value === 'fr' ? value.egcs_tp_name_fr : value.egcs_tp_name_en
/**
 * Retains missing selected labels as disabled history until the draft clears them.
 * @param field - Current field definition.
 * @returns Current choices and selected historical labels.
 */
const options = (field: AssignedAgencyCustomFieldDefinition) => {
  const selectedIds = field.egcs_ay_kind === 'relational' ? customFieldOptionIds(model.value[field.id]) : []
  const liveOptions = field.options.filter(option => option.egcs_ay_active || selectedIds.includes(option.id))
  const currentIds = new Set(liveOptions.map(option => option.id))
  const historical = currentHistory.value?.items.find(previous => previous.id === field.id)?.options ?? []
  return [...liveOptions, ...historical.filter(option => selectedIds.includes(option.id) && !currentIds.has(option.id)).map(option => ({ ...option, disabled: true }))]
}
</script>

<template>
  <div v-if="sections.length || (placement !== 'configured' && (error || catalogCheckFailed || (activity && readonly && status === 'success')))" :class="placement === 'profile' ? 'contents' : 'space-y-8'" data-field-exclude="Agency-defined custom inputs have separate configuration; outside static field help." @focusin="checkCatalogVersions">
    <CommonErrorNotice v-if="placement !== 'configured' && (error || catalogCheckFailed)" :class="{ 'col-span-full': placement === 'profile' }" :title="t('common.error')">
      <template #actions>
        <UButton :label="t('common.retry')" @click="retryFields" />
      </template>
    </CommonErrorNotice>
    <p v-else-if="activity && readonly && status === 'success' && sections.length === 0" class="text-sm text-muted">
      {{ t('common.not_available') }}
    </p>
    <component :is="placement === 'profile' ? 'div' : CommonSection" v-for="(section, index) in sections" :key="section.id" :title="placement === 'profile' ? undefined : sectionLabel(section)" :badge="activity || placement === 'profile' ? undefined : String(index + 4).padStart(2, '0')" :grid-cols="placement === 'profile' ? undefined : 2" :class="{ contents: placement === 'profile' }" data-field-container="Layout wrapper for Agency-defined custom fields.">
      <AgreementFieldsCustomField
        v-for="field in section.fields"
        :key="field.id"
        :model-value="model[field.id]"
        :field="field"
        :currency="currency"
        :options="options(field)"
        :readonly="readonly"
        :select-disabled="checkingCatalog || catalogCheckFailed"
        :clear-disabled="status === 'pending'"
        @open-options="checkCatalogVersions"
        @update:model-value="model = { ...model, [field.id]: $event ?? null }" />
    </component>
  </div>
</template>
