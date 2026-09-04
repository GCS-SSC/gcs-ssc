<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local field helpers are self-documenting and not public APIs */
import { computed, watch } from 'vue'
import type { ApplicantRecipientProfileForm } from '~~/shared/types/applicant-recipient-ui'

const model = defineModel<ApplicantRecipientProfileForm>('model', { required: true })
const {
  namePrefix = '',
  leadAgencyPermissionAction = 'update'
} = defineProps<{
  namePrefix?: string
  leadAgencyPermissionAction?: 'create' | 'update'
}>()

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)

const bilingualErrorPattern = (fieldBase: 'egcs_ar_legalname' | 'egcs_ar_operatingname' | 'egcs_ar_description') => {
  const englishPath = field(`${fieldBase}_en`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const frenchPath = field(`${fieldBase}_fr`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^(?:${englishPath}|${frenchPath})$`)
}

const selectedAgencyId = computed(() => {
  if (!model.value?.egcs_ar_leadagency) {
    return ''
  }

  return String(model.value.egcs_ar_leadagency)
})

const selectedProponentId = computed(() => {
  if (!model.value?.id) {
    return ''
  }

  return String(model.value.id)
})

/**
 * Stores extension-owned proponent payloads inside the profile form submitted by the main save action.
 *
 * @param extensionKey - Extension key that owns the payload.
 * @param payloadKey - Payload field name within the extension namespace.
 * @param value - Extension-owned payload value.
 */
const setApplicantRecipientExtensionPayload = (extensionKey: string, payloadKey: string, value: unknown) => {
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

const proponentDescriptionsExtensionContext = computed(() => ({
  kind: 'proponent.descriptions',
  agencyId: selectedAgencyId.value,
  applicantRecipientId: selectedProponentId.value,
  descriptions: {
    en: model.value.egcs_ar_description_en ?? '',
    fr: model.value.egcs_ar_description_fr ?? ''
  },
  extensions: model.value.extensions ?? {},
  setExtensionPayload: setApplicantRecipientExtensionPayload
}))

type ApplicantRecipientFieldKey =
  | 'subtype'
  | 'lead_agency'
  | 'legal_name_en'
  | 'legal_name_fr'
  | 'operating_name_en'
  | 'operating_name_fr'
  | 'research_organization_en'
  | 'research_organization_fr'
  | 'description_en'
  | 'description_fr'

const getFieldText = (key: ApplicantRecipientFieldKey) => ({
  fieldName: t(`applicant_recipient.fields.${key}.field_name`),
  placeholder: t(`applicant_recipient.fields.${key}.placeholder`),
  tooltip: t(`applicant_recipient.fields.${key}.tooltip`)
})

watch(() => model.value?.egcs_ar_leadagency, (currentAgencyId, previousAgencyId) => {
  if (!previousAgencyId || currentAgencyId === previousAgencyId) {
    return
  }

  if (!model.value) {
    return
  }

  model.value.egcs_ar_applicantrecipientsubtypes = undefined
})
</script>

<template>
  <CommonSection :title="t('applicant_recipient.sections.classification')" badge="01" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_applicantrecipientsubtypes')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('subtype').fieldName"
            :tooltip="getFieldText('subtype').tooltip" />
        </template>
        <CommonServerLookupSelect
          v-model="model.egcs_ar_applicantrecipientsubtypes"
          fetch-url="/api/applicant-recipients/lookups/subtypes"
          :query="{
            agency_id: model.egcs_ar_leadagency ? String(model.egcs_ar_leadagency) : '',
            applicant_recipient_id: selectedProponentId,
            permission_action: leadAgencyPermissionAction
          }"
          value-key="id"
          label-en-key="egcs_ay_name_en"
          label-fr-key="egcs_ay_name_fr"
          :placeholder="getFieldText('subtype').placeholder"
          searchable />
      </UFormField>

      <UFormField class="xl:col-span-6" :name="field('egcs_ar_leadagency')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('lead_agency').fieldName"
            :tooltip="getFieldText('lead_agency').tooltip" />
        </template>
        <CommonServerLookupSelect
          :model-value="model.egcs_ar_leadagency ?? undefined"
          fetch-url="/api/applicant-recipients/lookups/agencies"
          value-key="id"
          label-en-key="egcs_ay_name_en"
          label-fr-key="egcs_ay_name_fr"
          :placeholder="getFieldText('lead_agency').placeholder"
          :query="{
            applicant_recipient_id: selectedProponentId,
            permission_action: leadAgencyPermissionAction
          }"
          searchable
          @update:model-value="value => model.egcs_ar_leadagency = value" />
      </UFormField>

      <UFormField class="xl:col-span-6" :label="t('common.active')" :name="field('egcs_ar_active')">
        <USwitch v-model="model.egcs_ar_active" :label="t('common.active')" />
      </UFormField>
    </div>
  </CommonSection>

  <CommonSection :title="t('applicant_recipient.sections.identity')" badge="02" :grid-cols="1">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <p
        class="text-sm text-zinc-600 md:col-span-2 xl:col-span-12 dark:text-zinc-400"
        data-testid="legal-name-language-requirement">
        {{ t('applicant_recipient.requirements.legal_name') }}
      </p>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_legalname_en')"
        :error-pattern="bilingualErrorPattern('egcs_ar_legalname')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('legal_name_en').fieldName"
            :tooltip="getFieldText('legal_name_en').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_legalname_en" :placeholder="getFieldText('legal_name_en').placeholder" />
      </UFormField>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_legalname_fr')"
        :error="false"
        :error-pattern="bilingualErrorPattern('egcs_ar_legalname')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('legal_name_fr').fieldName"
            :tooltip="getFieldText('legal_name_fr').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_legalname_fr" :placeholder="getFieldText('legal_name_fr').placeholder" />
      </UFormField>
      <p
        class="text-sm text-zinc-600 md:col-span-2 xl:col-span-12 dark:text-zinc-400"
        data-testid="operating-name-language-requirement">
        {{ t('applicant_recipient.requirements.operating_name') }}
      </p>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_operatingname_en')"
        :error-pattern="bilingualErrorPattern('egcs_ar_operatingname')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('operating_name_en').fieldName"
            :tooltip="getFieldText('operating_name_en').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_operatingname_en" :placeholder="getFieldText('operating_name_en').placeholder" />
      </UFormField>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_operatingname_fr')"
        :error="false"
        :error-pattern="bilingualErrorPattern('egcs_ar_operatingname')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('operating_name_fr').fieldName"
            :tooltip="getFieldText('operating_name_fr').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_operatingname_fr" :placeholder="getFieldText('operating_name_fr').placeholder" />
      </UFormField>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_researchorganization_en')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('research_organization_en').fieldName"
            :tooltip="getFieldText('research_organization_en').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_researchorganization_en" :placeholder="getFieldText('research_organization_en').placeholder" />
      </UFormField>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_researchorganization_fr')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('research_organization_fr').fieldName"
            :tooltip="getFieldText('research_organization_fr').tooltip" />
        </template>
        <UInput v-model="model.egcs_ar_researchorganization_fr" :placeholder="getFieldText('research_organization_fr').placeholder" />
      </UFormField>
      <p
        class="text-sm text-zinc-600 md:col-span-2 xl:col-span-12 dark:text-zinc-400"
        data-testid="description-language-requirement">
        {{ t('applicant_recipient.requirements.description') }}
      </p>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_description_en')"
        :error-pattern="bilingualErrorPattern('egcs_ar_description')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('description_en').fieldName"
            :tooltip="getFieldText('description_en').tooltip" />
        </template>
        <CommonTextarea
          v-model="model.egcs_ar_description_en"
          :placeholder="getFieldText('description_en').placeholder"
          :rows="4" />
      </UFormField>
      <UFormField
        class="xl:col-span-6"
        :name="field('egcs_ar_description_fr')"
        :error="false"
        :error-pattern="bilingualErrorPattern('egcs_ar_description')">
        <template #label>
          <CommonFormFieldLabel
            :label="getFieldText('description_fr').fieldName"
            :tooltip="getFieldText('description_fr').tooltip" />
        </template>
        <CommonTextarea
          v-model="model.egcs_ar_description_fr"
          :placeholder="getFieldText('description_fr').placeholder"
          :rows="4" />
      </UFormField>
      <div class="xl:col-span-12">
        <ExtensionSlotHost
          v-if="selectedAgencyId"
          slot-name="proponent.descriptions.after"
          :agency-id="selectedAgencyId"
          :permission-action="leadAgencyPermissionAction"
          :context="proponentDescriptionsExtensionContext" />
      </div>
    </div>
  </CommonSection>
</template>
