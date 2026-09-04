<script setup lang="ts">
import { getClientRequestUrl } from '~/utils/client-request-url'
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type {
  FundingCaseAgreementProfileForm,
  FundingCaseAgreementSubtypeLookupItem
} from '~~/shared/types/funding-case-agreement-ui'

const {
  permissionAction,
  agreementId,
  namePrefix = ''
} = defineProps<{
  permissionAction: 'create' | 'update'
  agreementId?: string
  namePrefix?: string
}>()

const model = defineModel<FundingCaseAgreementProfileForm>('model', {
  default: () => ({
    egcs_fc_furtherdistribution: false,
    egcs_fc_holdback: 10
  })
})

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)

const previousStreamId = ref<string | undefined>(undefined)
const riskScoreSelection: Ref<string | undefined> = ref(undefined)
const riskWorkflowManaged: Ref<boolean> = ref(false)
const riskManagementStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
const hasRiskManagementError: Ref<boolean> = ref(false)
let riskManagementRequestGeneration = 0
let subtypeRequestGeneration = 0

type RiskManagementResponse = {
  workflow_managed: boolean
}

/**
 * Checks that the lookup authoritatively declares the Stream's risk-management mode.
 *
 * @param value - Parsed lookup response.
 * @returns Whether the response contains the required boolean decision.
 */
const isRiskManagementResponse = (value: unknown): value is RiskManagementResponse => {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).workflow_managed === 'boolean'
}

const selectedStreamId = computed(() => {
  if (!model.value?.egcs_fc_transferpaymentstream) {
    return ''
  }

  return String(model.value.egcs_fc_transferpaymentstream)
})

/**
 * Stores extension-owned agreement payloads inside the form body submitted by the main save action.
 *
 * @param extensionKey - Extension key that owns the payload.
 * @param payloadKey - Payload field name within the extension namespace.
 * @param value - Extension-owned payload value.
 */
const setAgreementExtensionPayload = (extensionKey: string, payloadKey: string, value: unknown) => {
  const currentExtensions = model.value.extensions && typeof model.value.extensions === 'object'
    ? model.value.extensions
    : {}
  const currentPayload = currentExtensions[extensionKey] && typeof currentExtensions[extensionKey] === 'object'
    ? currentExtensions[extensionKey]
    : {}

  model.value = {
    ...model.value,
    extensions: {
      ...currentExtensions,
      [extensionKey]: {
        ...currentPayload,
        [payloadKey]: value
      }
    }
  }
}

const agreementDescriptionsExtensionContext = computed(() => ({
  kind: 'agreement.descriptions',
  agreementId,
  streamId: selectedStreamId.value,
  descriptions: {
    en: model.value.egcs_fc_description_en ?? '',
    fr: model.value.egcs_fc_description_fr ?? ''
  },
  extensions: model.value.extensions ?? {},
  setExtensionPayload: setAgreementExtensionPayload
}))

const agreementProfileExtensionContext = computed(() => ({
  kind: 'agreement.profile',
  mode: permissionAction,
  agreementId,
  streamId: selectedStreamId.value,
  ownerType: 'fundingcaseagreement',
  ownerId: agreementId,
  profile: model.value,
  extensions: model.value.extensions ?? {},
  setExtensionPayload: setAgreementExtensionPayload
}))

const agreementDescriptionEnExtensionContext = computed(() => ({
  textarea: {
    kind: 'agreement.description',
    targetKey: 'agreement.description',
    locale: 'en',
    label: t('agreement.description_en'),
    text: model.value.egcs_fc_description_en ?? '',
    streamId: selectedStreamId.value,
    entityType: 'fundingcaseagreement',
    entityId: agreementId,
    ownerType: 'fundingcaseagreement',
    ownerId: agreementId,
    extensions: model.value.extensions ?? {},
    setExtensionPayload: setAgreementExtensionPayload
  }
}))

const agreementDescriptionFrExtensionContext = computed(() => ({
  textarea: {
    kind: 'agreement.description',
    targetKey: 'agreement.description',
    locale: 'fr',
    label: t('agreement.description_fr'),
    text: model.value.egcs_fc_description_fr ?? '',
    streamId: selectedStreamId.value,
    entityType: 'fundingcaseagreement',
    entityId: agreementId,
    ownerType: 'fundingcaseagreement',
    ownerId: agreementId,
    extensions: model.value.extensions ?? {},
    setExtensionPayload: setAgreementExtensionPayload
  }
}))

const subtypeResponse: Ref<{ items: FundingCaseAgreementSubtypeLookupItem[] }> = ref({ items: [] })
const subtypeStatus: Ref<'idle' | 'pending' | 'success' | 'error'> = ref('idle')
/**
 *
 */
const refreshSubtypeOptions = async () => {
  const requestedStreamId = selectedStreamId.value
  const requestGeneration = ++subtypeRequestGeneration
  if (!requestedStreamId) {
    subtypeResponse.value = { items: [] }
    subtypeStatus.value = 'idle'
    return
  }

  try {
    subtypeStatus.value = 'pending'
    const requestUrl = getClientRequestUrl('/api/agreements/lookups/agreement-subtypes')
    requestUrl.searchParams.set('page', '1')
    requestUrl.searchParams.set('limit', '100')
    requestUrl.searchParams.set('permission_action', permissionAction)
    requestUrl.searchParams.set('stream_id', requestedStreamId)
    if (agreementId) {
      requestUrl.searchParams.set('agreement_id', agreementId)
    }
    const response = await fetch(requestUrl)
    const payload = response.ok ? await response.json() as { items: FundingCaseAgreementSubtypeLookupItem[] } : { items: [] }
    if (requestGeneration !== subtypeRequestGeneration || requestedStreamId !== selectedStreamId.value) return
    subtypeResponse.value = payload
    subtypeStatus.value = response.ok ? 'success' : 'error'
  } catch {
    if (requestGeneration !== subtypeRequestGeneration || requestedStreamId !== selectedStreamId.value) return
    subtypeResponse.value = { items: [] }
    subtypeStatus.value = 'error'
  }
}

/** Refreshes whether the selected Stream delegates risk scoring to a published Workflow. */
const refreshRiskManagement = async () => {
  const requestedStreamId = selectedStreamId.value
  const requestGeneration = ++riskManagementRequestGeneration
  if (!requestedStreamId) {
    riskWorkflowManaged.value = false
    riskManagementStatus.value = 'idle'
    hasRiskManagementError.value = false
    return
  }
  riskManagementStatus.value = 'pending'
  const requestUrl = getClientRequestUrl('/api/agreements/lookups/risk-ratings')
  requestUrl.searchParams.set('page', '1')
  requestUrl.searchParams.set('limit', '1')
  requestUrl.searchParams.set('permission_action', permissionAction)
  requestUrl.searchParams.set('stream_id', requestedStreamId)
  if (agreementId) requestUrl.searchParams.set('agreement_id', agreementId)
  try {
    const response = await fetch(requestUrl)
    if (!response.ok) throw new Error('Risk management lookup failed')
    const payload: unknown = await response.json()
    if (!isRiskManagementResponse(payload)) throw new Error('Risk management lookup returned an invalid response')
    if (
      requestGeneration === riskManagementRequestGeneration
      && selectedStreamId.value === requestedStreamId
    ) {
      riskWorkflowManaged.value = payload.workflow_managed
      if (payload.workflow_managed && Object.hasOwn(model.value, 'egcs_fc_riskscore')) {
        const currentRiskScore = model.value.egcs_fc_riskscore
        if (currentRiskScore !== undefined && currentRiskScore !== null && currentRiskScore !== '') {
          riskScoreSelection.value = String(currentRiskScore)
        }
        const nextModel: FundingCaseAgreementProfileForm = { ...model.value }
        delete nextModel.egcs_fc_riskscore
        model.value = nextModel
      }
      hasRiskManagementError.value = false
      riskManagementStatus.value = 'success'
    }
  } catch {
    if (
      requestGeneration === riskManagementRequestGeneration
      && selectedStreamId.value === requestedStreamId
    ) {
      hasRiskManagementError.value = true
      riskManagementStatus.value = 'error'
    }
  }
}

const subtypeItems = computed<FundingCaseAgreementSubtypeLookupItem[]>(() => subtypeResponse.value?.items ?? [])

const selectedSubtype = computed(() => {
  const subtypeId = model.value.egcs_fc_agreementsubtype
  if (!subtypeId) {
    return null
  }

  return subtypeItems.value.find(item => String(item.id) === String(subtypeId)) ?? null
})

watch(selectedStreamId, value => {
  if (!value) {
    subtypeRequestGeneration += 1
    riskManagementRequestGeneration += 1
    riskWorkflowManaged.value = false
    riskManagementStatus.value = 'idle'
    hasRiskManagementError.value = false
    riskScoreSelection.value = undefined
    model.value = {
      ...model.value,
      egcs_fc_agreementsubtype: undefined,
      egcs_fc_agreementtype: undefined,
      egcs_fc_holdbackbasis: undefined,
      egcs_fc_riskscore: undefined
    }
    previousStreamId.value = undefined
    subtypeResponse.value = { items: [] }
    subtypeStatus.value = 'idle'
    return
  }

  if (previousStreamId.value && previousStreamId.value !== value) {
    riskWorkflowManaged.value = false
    riskManagementStatus.value = 'idle'
    hasRiskManagementError.value = false
    riskScoreSelection.value = undefined
    model.value = {
      ...model.value,
      egcs_fc_agreementsubtype: undefined,
      egcs_fc_agreementtype: undefined,
      egcs_fc_holdbackbasis: undefined,
      egcs_fc_riskscore: undefined
    }
  }

  previousStreamId.value = value

  void refreshSubtypeOptions()
  void refreshRiskManagement()
}, { immediate: true })

watch(() => model.value.egcs_fc_riskscore, value => {
  if (
    riskWorkflowManaged.value
    && (value === undefined || value === null || value === '')
  ) {
    return
  }
  riskScoreSelection.value = value === undefined || value === null || value === '' ? undefined : String(value)
}, { immediate: true })

watch(riskScoreSelection, value => {
  const nextRiskScore = value === undefined || value === '' ? undefined : value
  if (model.value.egcs_fc_riskscore === nextRiskScore) {
    return
  }

  model.value = {
    ...model.value,
    egcs_fc_riskscore: nextRiskScore
  }
})

watch(selectedSubtype, value => {
  model.value = {
    ...model.value,
    egcs_fc_agreementtype: value?.agreement_type
  }
}, { immediate: true })
</script>

<template>
  <CommonSection :title="t('agreement.sections.classification')" badge="01" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('agreement.stream')" :name="field('egcs_fc_transferpaymentstream')">
        <CommonServerLookupSelect
          v-model="model.egcs_fc_transferpaymentstream"
          fetch-url="/api/agreements/lookups/streams"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :query="{
            ...(agreementId ? { agreement_id: agreementId } : {}),
            permission_action: permissionAction
          }"
          :placeholder="t('agreement.stream_placeholder')"
          searchable />
      </UFormField>

      <UFormField :label="t('agreement.agreement_subtype')" :name="field('egcs_fc_agreementsubtype')">
        <CommonServerLookupSelect
          v-if="selectedStreamId"
          v-model="model.egcs_fc_agreementsubtype"
          fetch-url="/api/agreements/lookups/agreement-subtypes"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :query="selectedStreamId
            ? {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction,
              stream_id: selectedStreamId
            }
            : {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction
            }"
          :disabled="!selectedStreamId || subtypeStatus === 'pending'"
          :placeholder="t('agreement.agreement_subtype_placeholder')"
          searchable />
        <UButton v-else block color="neutral" variant="outline" disabled :label="t('agreement.agreement_subtype_placeholder')" />
      </UFormField>

      <UFormField :label="t('agreement.agreement_number')" :name="field('egcs_fc_agreementnumber')">
        <UInput
          v-model="model.egcs_fc_agreementnumber"
          :placeholder="t('agreement.agreement_number_placeholder')" />
      </UFormField>

      <UFormField :label="t('agreement.financial_system_number')" :name="field('egcs_fc_financialsystemnumber')">
        <UInput
          v-model="model.egcs_fc_financialsystemnumber"
          :placeholder="t('agreement.financial_system_number_placeholder')"
          inputmode="numeric" />
      </UFormField>

      <UFormField :label="t('agreement.authorized_assistance_start_date')" :name="field('egcs_fc_authorizedassistancestartdate')">
        <CommonDatePicker v-model="model.egcs_fc_authorizedassistancestartdate" />
      </UFormField>

      <UFormField :label="t('agreement.authorized_assistance_end_date')" :name="field('egcs_fc_authorizedassistanceenddate')">
        <CommonDatePicker v-model="model.egcs_fc_authorizedassistanceenddate" />
      </UFormField>

      <UFormField :label="t('agreement.further_distribution')" :name="field('egcs_fc_furtherdistribution')">
        <div class="flex min-h-10 items-center">
          <USwitch v-model="model.egcs_fc_furtherdistribution" />
        </div>
      </UFormField>

      <div class="md:col-span-2">
        <ExtensionSlotHost
          v-if="selectedStreamId"
          slot-name="agreement.profile.classification.fields"
          :stream-id="selectedStreamId"
          :permission-action="permissionAction"
          :context="agreementProfileExtensionContext" />
      </div>
    </div>
  </CommonSection>

  <CommonSection :title="t('agreement.sections.profile')" badge="02" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('agreement.title_en')" :name="field('egcs_fc_title_en')">
        <UInput v-model="model.egcs_fc_title_en" :placeholder="t('agreement.title_en_placeholder')" />
      </UFormField>

      <UFormField :label="t('agreement.title_fr')" :name="field('egcs_fc_title_fr')">
        <UInput v-model="model.egcs_fc_title_fr" :placeholder="t('agreement.title_fr_placeholder')" />
      </UFormField>

      <UFormField :label="t('agreement.description_en')" :name="field('egcs_fc_description_en')">
        <CommonTextarea
          v-model="model.egcs_fc_description_en"
          :placeholder="t('agreement.description_en_placeholder')"
          :rows="4"
          :stream-id="selectedStreamId"
          extension-slot-name="textarea.after"
          :extension-permission-action="permissionAction"
          :extension-context="agreementDescriptionEnExtensionContext" />
      </UFormField>

      <UFormField :label="t('agreement.description_fr')" :name="field('egcs_fc_description_fr')">
        <CommonTextarea
          v-model="model.egcs_fc_description_fr"
          :placeholder="t('agreement.description_fr_placeholder')"
          :rows="4"
          :stream-id="selectedStreamId"
          extension-slot-name="textarea.after"
          :extension-permission-action="permissionAction"
          :extension-context="agreementDescriptionFrExtensionContext" />
      </UFormField>

      <div class="md:col-span-2">
        <ExtensionSlotHost
          v-if="selectedStreamId"
          slot-name="agreement.descriptions.after"
          :stream-id="selectedStreamId"
          :permission-action="permissionAction"
          :context="agreementDescriptionsExtensionContext" />
      </div>

      <div class="md:col-span-2">
        <ExtensionSlotHost
          v-if="selectedStreamId"
          slot-name="agreement.profile.profile.fields"
          :stream-id="selectedStreamId"
          :permission-action="permissionAction"
          :context="agreementProfileExtensionContext" />
      </div>
    </div>
  </CommonSection>

  <CommonSection :title="t('agreement.sections.risk_management')" badge="03" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <UFormField :label="t('agreement.holdback')" :name="field('egcs_fc_holdback')">
        <UInput
          v-model="model.egcs_fc_holdback"
          :placeholder="t('agreement.holdback_placeholder')"
          type="number"
          min="0"
          max="100"
          step="0.01" />
      </UFormField>

      <UFormField :label="t('agreement.holdback_basis')" :name="field('egcs_fc_holdbackbasis')">
        <CommonServerLookupSelect
          v-if="selectedStreamId"
          v-model="model.egcs_fc_holdbackbasis"
          fetch-url="/api/agreements/lookups/holdback-bases"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :query="selectedStreamId
            ? {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction,
              stream_id: selectedStreamId
            }
            : {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction
            }"
          :disabled="!selectedStreamId"
          :placeholder="t('agreement.holdback_basis_placeholder')"
          searchable />
        <UButton v-else block color="neutral" variant="outline" disabled :label="t('agreement.holdback_basis_placeholder')" />
      </UFormField>

      <UFormField :label="t('agreement.risk_score')" :name="field('egcs_fc_riskscore')">
        <CommonServerLookupSelect
          v-if="selectedStreamId"
          v-model="riskScoreSelection"
          data-testid="risk-score-lookup"
          fetch-url="/api/agreements/lookups/risk-ratings"
          value-key="egcs_tp_riskscore"
          label-en-key="label_en"
          label-fr-key="label_fr"
          :show-value-in-label="false"
          :query="selectedStreamId
            ? {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction,
              stream_id: selectedStreamId
            }
            : {
              ...(agreementId ? { agreement_id: agreementId } : {}),
              permission_action: permissionAction
            }"
          :disabled="!selectedStreamId || riskWorkflowManaged || riskManagementStatus !== 'success'"
          :placeholder="t('agreement.risk_score_placeholder')"
          searchable />
        <UButton v-else block color="neutral" variant="outline" disabled :label="t('agreement.risk_score_placeholder')" />
        <div
          v-if="hasRiskManagementError"
          data-testid="risk-management-error"
          class="mt-2 flex flex-wrap items-center gap-2 text-sm text-error"
          role="alert">
          <span>{{ t('agreement.risk_rating_management_load_failed') }}</span>
          <UButton
            data-testid="risk-management-retry"
            color="error"
            variant="soft"
            size="xs"
            icon="i-lucide-refresh-cw"
            :label="t('common.retry')"
            :loading="riskManagementStatus === 'pending'"
            :disabled="riskManagementStatus === 'pending'"
            @click="refreshRiskManagement" />
        </div>
        <p v-else-if="riskManagementStatus === 'success' && riskWorkflowManaged" class="mt-1 text-sm text-muted">
          {{ t('agreement.risk_rating_managed_help') }}
        </p>
      </UFormField>

      <div class="md:col-span-2">
        <ExtensionSlotHost
          v-if="selectedStreamId"
          slot-name="agreement.profile.risk-management.fields"
          :stream-id="selectedStreamId"
          :permission-action="permissionAction"
          :context="agreementProfileExtensionContext" />
      </div>
    </div>
  </CommonSection>

  <ExtensionSlotHost
    v-if="selectedStreamId"
    slot-name="agreement.profile.sections.after"
    :stream-id="selectedStreamId"
    :permission-action="permissionAction"
    :context="agreementProfileExtensionContext" />
</template>
