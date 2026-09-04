<script setup lang="ts">
import { computed } from 'vue'
import type { AgencyProfileItem } from '~~/shared/types/schemas'

const { agency, isCollapsed, canUpdate } = defineProps<{
  agency: AgencyProfileItem
  isCollapsed: boolean
  canUpdate: boolean
}>()

const emit = defineEmits<{
  (event: 'edit'): void
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const title = computed(() => getBilingualValue(agency, 'egcs_ay_name', ''))
const iconText = computed(() => getBilingualValue(agency, 'egcs_ay_abbreviation', '??').toUpperCase())
const metaItems = computed(() => [
  `#${agency.id}`,
  agency.egcs_ay_agencyfinancialsystemid ? `${t('agency.financial_id')} ${agency.egcs_ay_agencyfinancialsystemid}` : undefined
])
const badges = computed(() => [{
  variant: agency.egcs_ay_active ? 'active' : 'inactive'
}])
const actions = computed(() => canUpdate
  ? [{
      label: t('agency.detail.edit'),
      icon: 'i-lucide-edit-3',
      onClick: () => emit('edit')
    }]
  : [])
</script>

<template>
  <CommonEntityHero
    :is-collapsed="isCollapsed"
    :icon-text="iconText"
    :title="title"
    :meta-items="metaItems"
    :badges="badges"
    :actions="actions" />
</template>
