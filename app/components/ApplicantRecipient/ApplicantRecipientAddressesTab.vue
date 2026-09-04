<script setup lang="ts">
import type { ApplicantRecipientAddressForm } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientAddressCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()
const { items: jurisdictionItems } = useEnumSelectOptions({ name: 'jurisdiction' })

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { accessorKey: 'egcs_cn_street1', headerKey: 'admin_common.fields.egcs_cn_street1' },
  { accessorKey: 'egcs_cn_addresscity', headerKey: 'admin_common.fields.egcs_cn_addresscity' },
  { accessorKey: 'egcs_cn_postalcodezipcode', headerKey: 'admin_common.fields.egcs_cn_postalcodezipcode' },
  { id: 'actions', headerKey: 'common.actions' }
]

type NumericAddressField =
  | 'egcs_cn_gc_addressid'
  | 'egcs_cn_federalridingid'
  | 'egcs_cn_mainphone'
  | 'egcs_cn_mainphoneextension'

const isCanadianAddress = (state: ApplicantRecipientAddressForm) => String(state.egcs_cn_addresscountry ?? '').toLowerCase() === 'ca'

const getNumericFieldModelValue = (state: ApplicantRecipientAddressForm, key: NumericAddressField) => {
  return String(state[key] ?? '')
}

const updateNumericFieldValue = (state: ApplicantRecipientAddressForm, key: NumericAddressField, value: string) => {
  state[key] = value === '' ? undefined : Number(value)
}
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('applicant_recipient.addresses.title')"
    icon="i-lucide-map-pinned"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/addresses`"
    :post-url="canCreate ? `/api/applicant-recipients/${applicantRecipientId}/addresses` : undefined"
    :update-url-base="canUpdate ? `/api/applicant-recipients/${applicantRecipientId}/addresses` : undefined"
    :delete-url-base="canDelete ? `/api/applicant-recipients/${applicantRecipientId}/addresses` : undefined"
    :schema="ApplicantRecipientAddressCreateSchema"
    :columns="columns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('applicant_recipient.addresses.add')"
    :update-title="t('applicant_recipient.addresses.edit')"
    :search-placeholder="t('applicant_recipient.addresses.search')">
    <template #form="{ state }">
      <UFormField :label="t('admin_common.fields.egcs_cn_street1')" name="egcs_cn_street1">
        <UInput :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_street1 ?? '')" @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_street1 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_street2')" name="egcs_cn_street2">
        <UInput :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_street2 ?? '')" @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_street2 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_street3')" name="egcs_cn_street3">
        <UInput :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_street3 ?? '')" @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_street3 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresscity')" name="egcs_cn_addresscity">
        <UInput :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_addresscity ?? '')" @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_addresscity = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresscountry')" name="egcs_cn_addresscountry">
        <CommonEnumSelect v-model="(state as ApplicantRecipientAddressForm).egcs_cn_addresscountry" name="countries" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresssubdivision')" name="egcs_cn_addresssubdivision">
        <CommonEnumSelect
          v-if="isCanadianAddress(state as ApplicantRecipientAddressForm)"
          v-model="(state as ApplicantRecipientAddressForm).egcs_cn_addresssubdivision"
          name="jurisdiction"
          :items="jurisdictionItems" />
        <UInput
          v-else
          :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_addresssubdivision ?? '')"
          @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_addresssubdivision = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_gc_addressid')" name="egcs_cn_gc_addressid">
        <UInput :model-value="getNumericFieldModelValue(state as ApplicantRecipientAddressForm, 'egcs_cn_gc_addressid')" type="number" @update:model-value="value => updateNumericFieldValue(state as ApplicantRecipientAddressForm, 'egcs_cn_gc_addressid', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_federalridingid')" name="egcs_cn_federalridingid">
        <UInput :model-value="getNumericFieldModelValue(state as ApplicantRecipientAddressForm, 'egcs_cn_federalridingid')" type="number" @update:model-value="value => updateNumericFieldValue(state as ApplicantRecipientAddressForm, 'egcs_cn_federalridingid', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_mainphone')" name="egcs_cn_mainphone">
        <UInput :model-value="getNumericFieldModelValue(state as ApplicantRecipientAddressForm, 'egcs_cn_mainphone')" type="number" @update:model-value="value => updateNumericFieldValue(state as ApplicantRecipientAddressForm, 'egcs_cn_mainphone', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_mainphoneextension')" name="egcs_cn_mainphoneextension">
        <UInput :model-value="getNumericFieldModelValue(state as ApplicantRecipientAddressForm, 'egcs_cn_mainphoneextension')" type="number" @update:model-value="value => updateNumericFieldValue(state as ApplicantRecipientAddressForm, 'egcs_cn_mainphoneextension', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_postalcodezipcode')" name="egcs_cn_postalcodezipcode">
        <UInput :model-value="String((state as ApplicantRecipientAddressForm).egcs_cn_postalcodezipcode ?? '')" @update:model-value="value => (state as ApplicantRecipientAddressForm).egcs_cn_postalcodezipcode = value" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
