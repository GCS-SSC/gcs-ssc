<script setup lang="ts">
import { usePageResourceError } from '~/composables/usePageResourceError'
import AssessmentSchemaDetailPage from '~/components/AssessmentSchema/AssessmentSchemaDetailPage.vue'
import ChecklistSchemaDetailPage from '~/components/ChecklistSchema/ChecklistSchemaDetailPage.vue'

const route = useRoute()
const endpoint = computed(() => `/api/agency/${route.params.id}/review-schemas/${route.params.schemaId}`)
const request = useRequestFetch() as (path: string) => Promise<{ egcs_cn_reviewtype: 'assessment' | 'checklist' }>
const { data, error, status, refresh } = await useAsyncData(async () => {
  return await request(endpoint.value)
}, { watch: [endpoint] })

usePageResourceError({ identity: () => route.path, errors: [error], pending: () => status.value === 'pending', hasContent: () => Boolean(data.value) })

definePageMeta({
  i18n: {
    paths: {
      en: '/agencies/[id]/review-schemas/[schemaId]',
      fr: '/organismes/[id]/schemas-examen/[schemaId]'
    }
  }
})
</script>

<template>
  <CommonLoadingState v-if="status === 'pending'" :label="$t('common.loading')" />
  <UAlert v-else-if="error" color="error" :title="$t('common.load_failed')">
    <template #actions>
      <UButton :label="$t('common.retry')" @click="refresh()" />
    </template>
  </UAlert>
  <ChecklistSchemaDetailPage v-else-if="data?.egcs_cn_reviewtype === 'checklist'" />
  <AssessmentSchemaDetailPage v-else-if="data?.egcs_cn_reviewtype === 'assessment'" />
</template>
