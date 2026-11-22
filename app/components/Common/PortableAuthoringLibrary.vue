<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { appRouteLocations } from '~/utils/route-locations'
import { useActionContext } from '~/composables/useActionContext'

const { agencyId, kind } = defineProps<{ agencyId: string; kind: 'review' | 'recommendation' }>()
const { t } = useI18n()
const localePath = useLocalePath()
const open = ref(false)
const selected = ref<string>()
const endpoint = computed(() => `/api/agency/${encodeURIComponent(agencyId)}/${kind}-schemas`)
const destination = computed(() => {
  if (!selected.value) return undefined
  const schemaRoute = kind === 'review' ? appRouteLocations.agencyReviewSchemaDetail : appRouteLocations.agencyRecommendationSchemaDetail
  return localePath(schemaRoute(agencyId, selected.value))
})
const context = useActionContext({ identity: [() => agencyId, () => kind], authority: () => Boolean(agencyId) })
watch(context.version, () => {
  open.value = false
}, { flush: 'sync' })
watch(open, () => {
  selected.value = undefined
}, { flush: 'sync' })
</script>

<template>
  <UModal v-model:open="open" :title="t('portable_authoring.browse')" :description="t('portable_authoring.browse_help')">
    <UButton color="neutral" variant="outline" icon="i-lucide-library" :label="t('portable_authoring.browse')" />
    <template #body>
      <UFormField :label="t('portable_authoring.saved_schema')" required data-field-exclude="Navigation-only saved schema picker">
        <CommonServerLookupSelect
          v-if="open"
          v-model="selected"
          :fetch-url="endpoint"
          value-key="id"
          label-en-key="egcs_cn_name_en"
          label-fr-key="egcs_cn_name_fr"
          :show-value-in-label="false"
          :include-deleted-query="false"
          close-on-select
          class="w-full" />
      </UFormField>
    </template>
    <template #footer>
      <UButton
        :label="t('portable_authoring.open_schema')"
        :disabled="!destination"
        :to="destination"
        @click="open = false" />
    </template>
  </UModal>
</template>
