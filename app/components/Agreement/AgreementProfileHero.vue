<script setup lang="ts">
import { computed } from 'vue'
import type { StatusId } from '~~/shared/types/status'
import type { FundingCaseAgreementProfileForm, FundingCaseAgreementProfileRow } from '~~/shared/types/funding-case-agreement-ui'

type AgreementHeroProfile = (FundingCaseAgreementProfileForm & { egcs_fc_status?: StatusId }) | FundingCaseAgreementProfileRow

const {
  profile,
  isCollapsed,
  title,
  subtitle,
  showContext = false
} = defineProps<{
  profile: AgreementHeroProfile
  isCollapsed: boolean
  title: string
  subtitle?: string
  showContext?: boolean
}>()

const { t } = useI18n()
const { getBilingualValue } = useBilingualValue()

const streamName = computed(() => getBilingualValue(profile, 'stream_name', '-'))
const metaItems = computed(() => [
  subtitle,
  showContext ? `${t('agreement.stream')} ${streamName.value}` : undefined
])
const badges = computed(() => profile.egcs_fc_status
  ? [{
      statusId: profile.egcs_fc_status,
      isCompleted: 'isCompleted' in profile ? profile.isCompleted : false
    }]
  : [])
</script>

<template>
  <CommonEntityHero
    :is-collapsed="isCollapsed"
    icon="i-lucide-file-signature"
    :title="title"
    :meta-items="metaItems"
    :badges="badges" />
</template>
