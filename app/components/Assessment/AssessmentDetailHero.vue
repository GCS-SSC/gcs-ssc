<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

const {
  name,
  entityName,
  runtimeState,
  publicationVersion = null,
  isCollapsed = false
} = defineProps<{
  name: string
  entityName: string
  runtimeState?: RuntimeState
  publicationVersion?: number | null
  isCollapsed?: boolean
}>()

const { t } = useI18n()

const badges = computed(() => [
  ...(runtimeState ? [{ lifecycleEngine: 'runtime' as const, lifecycleState: runtimeState }] : []),
  ...(publicationVersion === null ? [] : [{ variant: 'code' as const, label: `${t('transfer_payment.schema_version')} ${publicationVersion}` }])
])
</script>

<template>
  <CommonEntityHero
    :is-collapsed="isCollapsed"
    icon="i-lucide-clipboard-check"
    :title="name"
    :meta-items="[entityName]"
    :badges="badges" />
</template>
