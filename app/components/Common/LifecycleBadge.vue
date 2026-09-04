<script setup lang="ts">
import type { PublicationState, RuntimeState } from '~~/shared/constants/system-lifecycle'

const { engine, state } = defineProps<{
  engine: 'publication' | 'runtime'
  state: PublicationState | RuntimeState
}>()
</script>

<template>
  <CommonStatusBadge
    :enum-name="`${engine}_state`"
    :status="state" />
</template>
