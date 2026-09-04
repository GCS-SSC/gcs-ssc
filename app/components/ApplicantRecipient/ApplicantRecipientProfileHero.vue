<script setup lang="ts">
import type { ApplicantRecipientProfileForm, ApplicantRecipientProfileRow } from '~~/shared/types/applicant-recipient-ui'

type ApplicantRecipientHeroProfile = ApplicantRecipientProfileForm & Partial<Pick<ApplicantRecipientProfileRow, 'lead_agency_name_en' | 'lead_agency_name_fr'>>

const {
  profile,
  isCollapsed,
  title,
  subtitle,
  showStatus = false,
  showLeadAgency = false
} = defineProps<{
  profile: ApplicantRecipientHeroProfile
  isCollapsed: boolean
  title: string
  subtitle?: string
  showStatus?: boolean
  showLeadAgency?: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const resolvedStatus = computed(() => profile.egcs_ar_active ? 'active' : 'inactive')

const leadAgencyName = computed(() => {
  return getBilingualValue(profile, 'lead_agency_name', '-')
})

const metaItems = computed(() => [
  subtitle,
  showLeadAgency ? `${t('applicant_recipient.lead_agency')} ${leadAgencyName.value}` : undefined
])

const badges = computed(() => {
  if (!showStatus) {
    return []
  }

  return [{
    variant: resolvedStatus.value
  }]
})
</script>

<template>
  <CommonEntityHero
    :is-collapsed="isCollapsed"
    icon="i-lucide-store"
    :title="title"
    :meta-items="metaItems"
    :badges="badges" />
</template>
