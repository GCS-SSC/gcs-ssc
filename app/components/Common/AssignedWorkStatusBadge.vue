<script setup lang="ts">
import { computed } from 'vue'
import type { AssignableEntityType } from '~~/shared/constants/enums'
import type { RuntimeState } from '~~/shared/constants/system-lifecycle'

const { entityType, status, isCompleted = false } = defineProps<{
  entityType: AssignableEntityType
  status: string
  isCompleted?: boolean
}>()
const runtimeState = computed(() => status as RuntimeState)
</script>

<template>
  <CommonStatusBadge
    v-if="entityType === 'applicantrecipient'"
    :variant="status === 'active' ? 'active' : 'inactive'" />
  <CommonLifecycleBadge
    v-else-if="entityType === 'commonreview' || entityType === 'commonrecommendation'"
    engine="runtime"
    :state="runtimeState" />
  <CommonRecordState
    v-else
    :status-id="status"
    :is-completed="isCompleted" />
</template>
