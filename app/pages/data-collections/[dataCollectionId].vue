<script setup lang="ts">
import { computed } from 'vue'
import { validateQuestionnaireResponses } from '~~/shared/types/schemas/questionnaire'
import type { QuestionnaireRuntimeConfiguration } from '~/utils/questionnaire-runtime'

definePageMeta({ i18n: { paths: { en: '/data-collections/[dataCollectionId]', fr: '/collectes-de-donnees/[dataCollectionId]' } } })
const route = useRoute()
const dataCollectionId = computed(() => String(route.params.dataCollectionId))
const configuration: QuestionnaireRuntimeConfiguration = {
  entityType: 'commondatacollection', apiBase: '/api/data-collections', panelId: 'data-collection-detail', messagePrefix: 'data_collection', icon: 'i-lucide-clipboard-list',
  validate: (definition, responses) => validateQuestionnaireResponses(definition, responses)
}
</script>

<template>
  <CommonQuestionnaireRuntimeDetail :key="dataCollectionId" :entity-id="dataCollectionId" :configuration="configuration" />
</template>
