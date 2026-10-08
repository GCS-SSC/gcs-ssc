<script setup lang="ts">
import type { RecommendationDefinition, RecommendationResponse } from '~~/shared/types/schemas/recommendation/recommendation'

const { definition, readonly = false, issues = [] } = defineProps<{
  definition: RecommendationDefinition
  readonly?: boolean
  issues?: Array<{ questionKey: string, message: string, field?: 'comment' }>
}>()
const responses = defineModel<RecommendationResponse[]>('responses', { required: true })
</script>

<template>
  <CommonQuestionnaireForm v-model:responses="responses" :definition="definition" :readonly="readonly" :issues="issues" />
</template>
