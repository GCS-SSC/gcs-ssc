<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local table helpers are self-documenting and not public APIs */
import { getPaginationRowModel } from '@tanstack/table-core'
import type { BilingualColumnConfig, TableColumnInput } from '~/composables/useTableColumns'
import { appRouteLocations } from '~/utils/route-locations'
import type { ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'
import type { ResourceTableStatus } from '~~/shared/types/resource-table'

const {
  profiles,
  totalRecords,
  loading = false,
  requestStatus,
  canCreate,
  canUpdate,
  canDelete
} = defineProps<{
  profiles: ApplicantRecipientProfileRow[]
  totalRecords: number
  loading?: boolean
  requestStatus?: ResourceTableStatus
  canCreate: boolean
  canUpdate: boolean | ((profile: ApplicantRecipientProfileRow) => boolean)
  canDelete: boolean | ((profile: ApplicantRecipientProfileRow) => boolean)
}>()

const emit = defineEmits<{
  (event: 'add' | 'retry'): void
  (event: 'edit' | 'delete', profile: ApplicantRecipientProfileRow): void
}>()

const search = defineModel<string>('search', { default: '' })
const statusFilter = defineModel<string>('statusFilter', { default: 'all' })
const pagination = defineModel<{ pageIndex: number; pageSize: number }>('pagination', { required: true })

const { t } = useI18n()
const localePath = useLocalePath()
const { getBilingualValue } = useBilingualValue()
const availabilityItems = computed(() => [
  { label: t('common.all'), value: 'all' },
  { label: t('common.active'), value: 'active' },
  { label: t('common.inactive'), value: 'inactive' }
])

const columns: TableColumnInput<ApplicantRecipientProfileRow>[] = [
  { id: 'select' },
  { accessorKey: 'id', headerKey: 'common.id' },
  { id: 'name', accessorKey: 'egcs_ar_legalname_en', headerKey: 'applicant_recipient.name' },
  { id: 'subtype', headerKey: 'applicant_recipient.subtype' },
  { id: 'lead_agency', headerKey: 'applicant_recipient.lead_agency' },
  { accessorKey: 'egcs_ar_active', headerKey: 'applicant_recipient.status' },
  { id: 'actions', headerKey: 'common.actions' }
]

const bilingualColumns: BilingualColumnConfig<ApplicantRecipientProfileRow>[] = [
  { id: 'name', accessorKey: { en: 'egcs_ar_legalname_en', fr: 'egcs_ar_legalname_fr' } },
  { id: 'subtype', accessorKey: { en: 'subtype_name_en', fr: 'subtype_name_fr' } },
  { id: 'lead_agency', accessorKey: { en: 'lead_agency_name_en', fr: 'lead_agency_name_fr' } }
]

const getDisplayName = (profile: ApplicantRecipientProfileRow) => {
  return getBilingualValue(profile, 'egcs_ar_legalname', getBilingualValue(profile, 'egcs_ar_operatingname', profile.id))
}

const canUpdateProfile = (profile: ApplicantRecipientProfileRow) => {
  if (typeof canUpdate === 'function') {
    return canUpdate(profile)
  }

  return canUpdate
}

const canDeleteProfile = (profile: ApplicantRecipientProfileRow) => {
  if (typeof canDelete === 'function') {
    return canDelete(profile)
  }

  return canDelete
}
</script>

<template>
  <CommonResourceLayoutPage
    v-model:search="search"
    v-model:status-filter="statusFilter"
    v-model:pagination="pagination"
    :data="profiles"
    :columns="columns"
    :bilingual-columns="bilingualColumns"
    :total-records="totalRecords"
    :loading="loading"
    :request-status="requestStatus"
    :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
    :button-label="t('applicant_recipient.new')"
    :show-button="canCreate"
    selectable
    @add="emit('add')"
    @retry="emit('retry')">
    <template #filters>
      <USelect v-model="statusFilter" :items="availabilityItems" :aria-label="t('common.status_filter')" class="min-w-40" />
    </template>
    <template #id-cell="{ row }">
      <span class="font-mono text-xs font-bold text-zinc-400 dark:text-zinc-500">
        {{ row.original.id }}
      </span>
    </template>

    <template #name-cell="{ row }">
      <NuxtLink
        :to="localePath(appRouteLocations.proponentEdit(String(row.original.id)))"
        class="font-bold text-zinc-900 transition-colors hover:text-primary dark:text-white">
        {{ getDisplayName(row.original) }}
      </NuxtLink>
    </template>

    <template #subtype-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'subtype_name', '-') }}
      </span>
    </template>

    <template #lead_agency-cell="{ row }">
      <span class="font-semibold text-zinc-700 dark:text-zinc-300">
        {{ getBilingualValue(row.original, 'lead_agency_name', '-') }}
      </span>
    </template>

    <template #egcs_ar_active-cell="{ row }">
      <CommonStatusBadge :variant="row.original.egcs_ar_active ? 'active' : 'inactive'" />
    </template>

    <template #actions-cell="{ row }">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-edit-3"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`${t('common.edit')}: ${getDisplayName(row.original)}`"
          :disabled="!canUpdateProfile(row.original)"
          @click="emit('edit', row.original)" />
        <UButton
          icon="i-lucide-trash"
          color="error"
          variant="ghost"
          size="sm"
          :aria-label="`${t('common.delete')}: ${getDisplayName(row.original)}`"
          :disabled="!canDeleteProfile(row.original)"
          @click="emit('delete', row.original)" />
      </div>
    </template>
  </CommonResourceLayoutPage>
</template>
