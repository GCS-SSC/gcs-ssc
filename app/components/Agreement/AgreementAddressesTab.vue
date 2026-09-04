<script setup lang="ts">
import type { FundingCaseAgreementAddressForm } from '~~/shared/types/funding-case-agreement-ui'
import { FundingCaseAgreementAddressCreateSchema } from '~~/shared/types/schemas'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'

const { agreementId, canCreate, canUpdate, canDelete } = defineProps<{
  agreementId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()
const { items: jurisdictionItems } = useEnumSelectOptions({ name: 'jurisdiction' })

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { id: 'address_type_name', accessorKey: 'address_type_name_en', headerKey: 'agreement.addresses.address_type' },
  { accessorKey: 'egcs_cn_street1', headerKey: 'admin_common.fields.egcs_cn_street1' },
  { accessorKey: 'egcs_cn_addresscity', headerKey: 'admin_common.fields.egcs_cn_addresscity' },
  { accessorKey: 'egcs_cn_postalcodezipcode', headerKey: 'admin_common.fields.egcs_cn_postalcodezipcode' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<{ id: string } & Record<string, unknown>>[] = [
  {
    id: 'address_type_name',
    accessorKey: {
      en: 'address_type_name_en',
      fr: 'address_type_name_fr'
    },
    headerKey: 'agreement.addresses.address_type'
  }
]

type NumericAddressField =
  | 'egcs_cn_gc_addressid'
  | 'egcs_cn_federalridingid'
  | 'egcs_cn_mainphone'
  | 'egcs_cn_mainphoneextension'

const isCanadianAddress = (state: FundingCaseAgreementAddressForm) => String(state.egcs_cn_addresscountry ?? '').toLowerCase() === 'ca'

/**
 * Updates the country and discards a subdivision that belongs to the previous country.
 *
 * @param state - Mutable address form state.
 * @param value - Newly selected country code.
 */
const updateAddressCountry = (state: FundingCaseAgreementAddressForm, value: string | number | undefined) => {
  const previousCountry = String(state.egcs_cn_addresscountry ?? '').toLowerCase()
  const nextCountry = String(value ?? '').toLowerCase()

  state.egcs_cn_addresscountry = nextCountry as FundingCaseAgreementAddressForm['egcs_cn_addresscountry']

  if (previousCountry !== nextCountry) {
    state.egcs_cn_addresssubdivision = ''
  }
}

const getNumericFieldModelValue = (state: FundingCaseAgreementAddressForm, key: NumericAddressField) => {
  return String(state[key] ?? '')
}

const updateNumericFieldValue = (state: FundingCaseAgreementAddressForm, key: NumericAddressField, value: string) => {
  state[key] = value === '' ? undefined : Number(value)
}

const getAddressTypeLookupUrl = (state: FundingCaseAgreementAddressForm) => {
  const permissionAction = state.id ? 'update' : 'create'
  return `/api/agreements/${agreementId}/addresses/lookups/address-types?permission_action=${permissionAction}`
}
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('agreement.addresses.title')"
    icon="i-lucide-map-pinned"
    :fetch-url="`/api/agreements/${agreementId}/addresses`"
    :post-url="canCreate ? `/api/agreements/${agreementId}/addresses` : undefined"
    :update-url-base="canUpdate ? `/api/agreements/${agreementId}/addresses` : undefined"
    :delete-url-base="canDelete ? `/api/agreements/${agreementId}/addresses` : undefined"
    :schema="FundingCaseAgreementAddressCreateSchema"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('agreement.addresses.add')"
    :update-title="t('agreement.addresses.edit')"
    :search-placeholder="t('agreement.addresses.search')">
    <template #form="{ state }">
      <UFormField :label="t('agreement.addresses.address_type')" name="egcs_fc_addresstype">
        <CommonServerLookupSelect
          :model-value="(state as FundingCaseAgreementAddressForm).egcs_fc_addresstype"
          :fetch-url="getAddressTypeLookupUrl(state as FundingCaseAgreementAddressForm)"
          value-key="id"
          label-en-key="label_en"
          label-fr-key="label_fr"
          searchable
          @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_fc_addresstype = value as string | undefined" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_street1')" name="egcs_cn_street1">
        <UInput :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_street1 ?? '')" @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_street1 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_street2')" name="egcs_cn_street2">
        <UInput :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_street2 ?? '')" @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_street2 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_street3')" name="egcs_cn_street3">
        <UInput :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_street3 ?? '')" @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_street3 = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresscity')" name="egcs_cn_addresscity">
        <UInput :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_addresscity ?? '')" @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_addresscity = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresscountry')" name="egcs_cn_addresscountry">
        <CommonEnumSelect
          :model-value="(state as FundingCaseAgreementAddressForm).egcs_cn_addresscountry"
          name="countries"
          @update:model-value="value => updateAddressCountry(state as FundingCaseAgreementAddressForm, value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_addresssubdivision')" name="egcs_cn_addresssubdivision">
        <CommonEnumSelect
          v-if="isCanadianAddress(state as FundingCaseAgreementAddressForm)"
          v-model="(state as FundingCaseAgreementAddressForm).egcs_cn_addresssubdivision"
          name="jurisdiction"
          :items="jurisdictionItems" />
        <UInput
          v-else
          :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_addresssubdivision ?? '')"
          @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_addresssubdivision = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_gc_addressid')" name="egcs_cn_gc_addressid">
        <UInput :model-value="getNumericFieldModelValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_gc_addressid')" type="number" @update:model-value="value => updateNumericFieldValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_gc_addressid', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_federalridingid')" name="egcs_cn_federalridingid">
        <UInput :model-value="getNumericFieldModelValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_federalridingid')" type="number" @update:model-value="value => updateNumericFieldValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_federalridingid', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_mainphone')" name="egcs_cn_mainphone">
        <UInput :model-value="getNumericFieldModelValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_mainphone')" type="number" @update:model-value="value => updateNumericFieldValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_mainphone', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_mainphoneextension')" name="egcs_cn_mainphoneextension">
        <UInput :model-value="getNumericFieldModelValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_mainphoneextension')" type="number" @update:model-value="value => updateNumericFieldValue(state as FundingCaseAgreementAddressForm, 'egcs_cn_mainphoneextension', value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_postalcodezipcode')" name="egcs_cn_postalcodezipcode">
        <UInput :model-value="String((state as FundingCaseAgreementAddressForm).egcs_cn_postalcodezipcode ?? '')" @update:model-value="value => (state as FundingCaseAgreementAddressForm).egcs_cn_postalcodezipcode = value" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
