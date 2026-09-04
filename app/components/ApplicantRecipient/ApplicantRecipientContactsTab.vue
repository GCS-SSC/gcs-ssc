<script setup lang="ts">
import type { ApplicantRecipientContactForm } from '~~/shared/types/applicant-recipient-ui'
import { ApplicantRecipientContactCreateSchema } from '~~/shared/types/schemas'
import type { TableColumnInput } from '~/composables/useTableColumns'

const { applicantRecipientId, canCreate, canUpdate, canDelete } = defineProps<{
  applicantRecipientId: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}>()

const { t } = useI18n()

const columns: TableColumnInput<{ id: string } & Record<string, unknown>>[] = [
  { accessorKey: 'egcs_cn_name', headerKey: 'admin_common.fields.egcs_cn_name' },
  { accessorKey: 'egcs_cn_email', headerKey: 'admin_common.fields.egcs_cn_email' },
  { accessorKey: 'egcs_cn_jobtitle_en', headerKey: 'admin_common.fields.egcs_cn_jobtitle_en' },
  { id: 'actions', headerKey: 'common.actions' }
]
</script>

<template>
  <CommonResourceCrud
    class="w-full"
    :title="t('applicant_recipient.contacts.title')"
    icon="i-lucide-contact"
    :fetch-url="`/api/applicant-recipients/${applicantRecipientId}/contacts`"
    :post-url="canCreate ? `/api/applicant-recipients/${applicantRecipientId}/contacts` : undefined"
    :update-url-base="canUpdate ? `/api/applicant-recipients/${applicantRecipientId}/contacts` : undefined"
    :delete-url-base="canDelete ? `/api/applicant-recipients/${applicantRecipientId}/contacts` : undefined"
    :schema="ApplicantRecipientContactCreateSchema"
    :columns="columns"
    :button-label="t('common.add')"
    :show-button="canCreate"
    :modal-title="t('applicant_recipient.contacts.add')"
    :update-title="t('applicant_recipient.contacts.edit')"
    :search-placeholder="t('applicant_recipient.contacts.search')">
    <template #form="{ state }">
      <UFormField :label="t('admin_common.fields.egcs_cn_title')" name="egcs_cn_title">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_title ?? '')" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_title = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_name')" name="egcs_cn_name">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_name ?? '')" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_name = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_businessphone')" name="egcs_cn_businessphone">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_businessphone ?? '')" type="number" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_businessphone = value === '' ? undefined : Number(value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_businessphoneextension')" name="egcs_cn_businessphoneextension">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_businessphoneextension ?? '')" type="number" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_businessphoneextension = value === '' ? undefined : Number(value)" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_generallanguagepreference')" name="egcs_cn_generallanguagepreference">
        <CommonEnumSelect v-model="(state as ApplicantRecipientContactForm).egcs_cn_generallanguagepreference" name="language_preference" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_jobtitle_en')" name="egcs_cn_jobtitle_en">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_jobtitle_en ?? '')" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_jobtitle_en = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_jobtitle_fr')" name="egcs_cn_jobtitle_fr">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_jobtitle_fr ?? '')" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_jobtitle_fr = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_primaryaccount')" name="egcs_cn_primaryaccount" class="flex items-center justify-between">
        <USwitch :model-value="Boolean((state as ApplicantRecipientContactForm).egcs_cn_primaryaccount)" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_primaryaccount = value" />
      </UFormField>
      <UFormField :label="t('admin_common.fields.egcs_cn_email')" name="egcs_cn_email">
        <UInput :model-value="String((state as ApplicantRecipientContactForm).egcs_cn_email ?? '')" type="email" @update:model-value="value => (state as ApplicantRecipientContactForm).egcs_cn_email = value" />
      </UFormField>
    </template>
  </CommonResourceCrud>
</template>
