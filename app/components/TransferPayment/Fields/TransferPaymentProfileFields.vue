<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- local date handlers are self-documenting and not public APIs */
import type { AdminCommonLookupResponseItem } from '~~/shared/types/admin-common-ui'
import type { AgencyOptionItem } from '~~/shared/types/admin'
import type { TransferPaymentProfile } from '~~/shared/types/schemas'

type TransferPaymentProfileFormModel = Partial<Omit<TransferPaymentProfile, 'egcs_tp_datestart' | 'egcs_tp_dateend'> & {
  id?: string
  egcs_tp_datestart?: string | Date
  egcs_tp_dateend?: string | Date
}>

const model = defineModel<TransferPaymentProfileFormModel>('model', { required: true })

const {
  isAgencyLocked = false,
  namePrefix = '',
  startDateValue,
  endDateValue,
  onUpdateStartDate,
  onUpdateEndDate,
  isStacked = false
} = defineProps<{
  isAgencyLocked?: boolean
  namePrefix?: string
  startDateValue?: string
  endDateValue?: string
  onUpdateStartDate?: (value: string) => void
  onUpdateEndDate?: (value: string) => void
  isStacked?: boolean
}>()

const emit = defineEmits<{ 'agency-resolved': [agency: AgencyOptionItem | null] }>()
const agencyLookupQuery = computed((): Record<string, string> => model.value.id
  ? { permission_action: 'update', transfer_payment_id: model.value.id }
  : { permission_action: 'create' })
const selectedAgencyUrl = computed(() => {
  if (!model.value.egcs_tp_agency) return undefined
  const query = new URLSearchParams(agencyLookupQuery.value)
  return `/api/transfer-payments/lookups/agencies/${model.value.egcs_tp_agency}?${query.toString()}`
})
const onAgencyResolved = (items: AdminCommonLookupResponseItem[]) => {
  const agency = items.find(item => String(item.id) === model.value.egcs_tp_agency)
  emit('agency-resolved', agency && typeof agency.egcs_ay_name_en === 'string' && typeof agency.egcs_ay_name_fr === 'string'
    ? { id: String(agency.id), egcs_ay_name_en: agency.egcs_ay_name_en, egcs_ay_name_fr: agency.egcs_ay_name_fr }
    : null)
}

const { t } = useI18n()
const field = useFormFieldPath(() => namePrefix)

const isCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]!
}

const formatUtcDate = (value: Date): string => {
  if (Number.isNaN(value.getTime())) return ''
  const year = value.getUTCFullYear().toString().padStart(4, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  const formatted = `${year}-${month}-${day}`
  return isCalendarDate(formatted) ? formatted : ''
}

const normalizeDateInput = (value: string | Date | null | undefined): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatUtcDate(value)
  if (isCalendarDate(value)) return value

  const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!timestamp || !isCalendarDate(timestamp[1]!)) return ''
  const hour = Number(timestamp[2])
  const minute = Number(timestamp[3])
  const second = Number(timestamp[4])
  const offsetHour = timestamp[6] === undefined ? 0 : Number(timestamp[6])
  const offsetMinute = timestamp[7] === undefined ? 0 : Number(timestamp[7])
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return ''
  return formatUtcDate(new Date(value))
}

const onStartDateInput = (value: string | Date | null | undefined) => {
  const normalizedValue = normalizeDateInput(value)
  if (onUpdateStartDate) {
    onUpdateStartDate(normalizedValue)
    return
  }
  model.value.egcs_tp_datestart = normalizedValue
}

const onEndDateInput = (value: string | Date | null | undefined) => {
  const normalizedValue = normalizeDateInput(value)
  if (onUpdateEndDate) {
    onUpdateEndDate(normalizedValue)
    return
  }
  model.value.egcs_tp_dateend = normalizedValue
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.agency')" :name="field('egcs_tp_agency')">
      <CommonServerLookupSelect
        v-model="model.egcs_tp_agency"
        fetch-url="/api/transfer-payments/lookups/agencies"
        :query="agencyLookupQuery"
        :selected-fetch-url="selectedAgencyUrl"
        :show-value-in-label="false"
        value-key="id"
        label-en-key="egcs_ay_name_en"
        label-fr-key="egcs_ay_name_fr"
        :aria-label="t('transfer_payment.agency')"
        :disabled="isAgencyLocked"
        @resolved-items="onAgencyResolved" />
    </UFormField>
    <div class="grid gap-2" :class="{ 'grid-cols-2': isStacked, 'grid-cols-1': !isStacked }">
      <UFormField :label="t('transfer_payment.start_date')" :name="field('egcs_tp_datestart')">
        <CommonDatePicker
          :model-value="normalizeDateInput(startDateValue ?? model.egcs_tp_datestart)"
          @update:model-value="onStartDateInput" />
      </UFormField>
      <UFormField :label="t('transfer_payment.end_date')" :name="field('egcs_tp_dateend')">
        <CommonDatePicker
          :model-value="normalizeDateInput(endDateValue ?? model.egcs_tp_dateend)"
          @update:model-value="onEndDateInput" />
      </UFormField>
    </div>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.name_en')" :name="field('egcs_tp_name_en')">
      <UInput v-model="model.egcs_tp_name_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.name_fr')" :name="field('egcs_tp_name_fr')">
      <UInput v-model="model.egcs_tp_name_fr" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.abbreviation_en')" :name="field('egcs_tp_abbreviation_en')">
      <UInput v-model="model.egcs_tp_abbreviation_en" />
    </UFormField>
    <UFormField :label="t('transfer_payment.abbreviation_fr')" :name="field('egcs_tp_abbreviation_fr')">
      <UInput v-model="model.egcs_tp_abbreviation_fr" />
    </UFormField>
  </div>

  <UFormField :label="t('transfer_payment.terms_link')" :name="field('egcs_tp_tclink')">
    <UInput v-model="model.egcs_tp_tclink" placeholder="https://..." />
  </UFormField>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.description_en')" :name="field('egcs_tp_description_en')">
      <CommonTextarea v-model="model.egcs_tp_description_en" :rows="3" />
    </UFormField>
    <UFormField :label="t('transfer_payment.description_fr')" :name="field('egcs_tp_description_fr')">
      <CommonTextarea v-model="model.egcs_tp_description_fr" :rows="3" />
    </UFormField>
  </div>

  <div class="grid grid-cols-1 gap-4" :class="{ 'md:grid-cols-2': isStacked }">
    <UFormField :label="t('transfer_payment.purpose_en')" :name="field('egcs_tp_purpose_en')">
      <CommonTextarea v-model="model.egcs_tp_purpose_en" :rows="3" />
    </UFormField>
    <UFormField :label="t('transfer_payment.purpose_fr')" :name="field('egcs_tp_purpose_fr')">
      <CommonTextarea v-model="model.egcs_tp_purpose_fr" :rows="3" />
    </UFormField>
  </div>
</template>
