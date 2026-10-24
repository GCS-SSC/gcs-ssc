<script setup lang="ts">
import { computed, onMounted, ref, type Ref } from 'vue'
import { helpRequest, type HelpOption } from '~/utils/guided-help-client'

definePageMeta({ i18n: { paths: { en: '/field-help', fr: '/aide-aux-champs' } } })
const { t, locale } = useI18n()
const { getHeroCollapsed } = useDashboard()
const collapsed = getHeroCollapsed('field-help')
const { showError } = useApiErrorToast()
const contexts: Ref<HelpOption[]> = ref([])
const agencyId = ref('')
const loading = ref(false)
const failed = ref(false)
const options = computed(() => contexts.value.map(item => ({ value: item.id, label: item.name[locale.value === 'fr' ? 'fr' : 'en'] })))
/** Loads only agencies where the current user may administer Help. */
const load = async () => {
  loading.value = true
  failed.value = false
  try {
    const result = await helpRequest<{ items: HelpOption[] }>('/api/guided-help/contexts')
    contexts.value = result.items
    if (!contexts.value.some(item => item.id === agencyId.value)) agencyId.value = contexts.value[0]?.id ?? ''
  } catch (error) {
    failed.value = true
    showError(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <CommonDetailPage id="field-help" v-model:collapsed="collapsed" :breadcrumb-items="[{ label: t('field_tooltips.title') }]">
    <template #body>
      <div class="space-y-6">
        <CommonEntityHero :is-collapsed="collapsed" icon="i-lucide-message-circle-question-mark" :title="t('field_tooltips.title')" />
        <UAlert v-if="failed" color="error" :title="t('common.load_failed')">
          <template #actions>
            <UButton :label="t('common.retry')" @click="load" />
          </template>
        </UAlert>
        <UFormField :label="t('field_tooltips.agency')" data-field-exclude="Help administration context selector" class="max-w-md">
          <USelect v-model="agencyId" :items="options" :loading="loading" class="w-full" />
        </UFormField>
        <AgencyFieldHelp v-if="agencyId" :key="agencyId" :agency-id="agencyId" />
        <p v-else-if="!loading && !failed" class="text-muted">
          {{ t('field_tooltips.no_agencies') }}
        </p>
      </div>
    </template>
  </CommonDetailPage>
</template>
