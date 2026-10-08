<script setup lang="ts">
import { computed } from 'vue'
import { validateRecommendationResponses } from '~~/shared/types/schemas/recommendation/recommendation'
import type { RecommendationDefinition } from '~~/shared/types/schemas/recommendation/recommendation'
import type { QuestionnaireRuntimeConfiguration } from '~/utils/questionnaire-runtime'

definePageMeta({ i18n: { paths: { en: '/recommendations/[recommendationId]', fr: '/recommandations/[recommendationId]' } } })
const route = useRoute()
const recommendationId = computed(() => String(route.params.recommendationId))
const configuration: QuestionnaireRuntimeConfiguration = {
  entityType: 'commonrecommendation', apiBase: '/api/recommendations', panelId: 'recommendation-detail', messagePrefix: 'recommendation', icon: 'i-lucide-message-square-quote',
  validate: (definition, responses) => validateRecommendationResponses(definition as RecommendationDefinition, responses)
}
</script>

<template>
  <CommonQuestionnaireRuntimeDetail :key="recommendationId" :entity-id="recommendationId" :configuration="configuration" />
</template>
