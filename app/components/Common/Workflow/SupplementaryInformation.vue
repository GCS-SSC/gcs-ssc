<script setup lang="ts">
import { useDetailSectionOwnership } from '~/composables/useDetailSectionOwnership'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { WorkflowSupplementaryInformationResponse } from '~~/shared/types/workflow-supplementary-information'

const fetchInformation = $fetch as unknown as (
  url: string,
  options: { query: { entityType: string, entityId: string }, signal: AbortSignal }
) => Promise<WorkflowSupplementaryInformationResponse>

const { entityType, entityId } = defineProps<{ entityType: string, entityId: string }>()
const { t } = useI18n()
const ownsHeading = useDetailSectionOwnership(() => t('supplementary_information.title'))
const { getBilingualValue } = useBilingualValue()
const { formatDate } = useDateHelpers({ formatterOptions: { dateStyle: 'medium', timeStyle: 'short' } })
const information: Ref<WorkflowSupplementaryInformationResponse | null> = ref(null)
const isLoading: Ref<boolean> = ref(false)
const hasLoadError: Ref<boolean> = ref(false)
const content: Ref<HTMLElement | null> = ref(null)
let requestController: AbortController | null = null

/**
 * Loads the exact entity's successful workflow evidence and rejects stale responses.
 * @returns Completion of the current read request.
 */
const loadInformation = async (): Promise<void> => {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  information.value = null
  hasLoadError.value = false
  isLoading.value = true
  try {
    const response = await fetchInformation('/api/workflows/supplementary-information', {
      query: { entityType, entityId },
      signal: controller.signal
    })
    if (requestController !== controller) return
    information.value = response
  } catch {
    if (requestController !== controller || controller.signal.aborted) return
    hasLoadError.value = true
  } finally {
    if (requestController === controller) isLoading.value = false
  }
}

/**
 * Retries a failed read and restores keyboard focus to the recovered view.
 * @returns Completion of the recovery action.
 */
const retry = async (): Promise<void> => {
  await loadInformation()
  if (!information.value) return
  await nextTick()
  content.value?.focus()
}

watch(() => [entityType, entityId], () => {
  void loadInformation()
}, { immediate: true })
onBeforeUnmount(() => {
  requestController?.abort()
  requestController = null
})
</script>

<template>
  <div ref="content" tabindex="-1" class="space-y-8" :aria-busy="isLoading" data-testid="supplementary-information">
    <CommonSection v-if="!ownsHeading" :title="t('supplementary_information.title')" icon="i-lucide-clipboard-list" :grid-cols="1">
      <p class="text-sm text-muted">
        {{ t('supplementary_information.description') }}
      </p>
    </CommonSection>

    <div v-if="isLoading" role="status" class="flex items-center gap-3 py-8 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      {{ t('common.loading') }}
    </div>

    <UAlert
      v-else-if="hasLoadError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :title="t('supplementary_information.load_failed')"
      :description="t('supplementary_information.load_failed_description')">
      <template #actions>
        <UButton color="neutral" variant="outline" :label="t('common.retry')" @click="retry" />
      </template>
    </UAlert>

    <template v-else-if="information">
      <CommonEmptyState v-if="information.workflows.length === 0" icon="i-lucide-clipboard-list" :description="t('supplementary_information.empty')" />
      <section
        v-for="workflow in information.workflows"
        :key="workflow.runtimeId"
        class="space-y-6 border-t border-default pt-6"
        data-testid="supplementary-workflow">
        <header class="space-y-2">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ getBilingualValue(workflow, 'name') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t(`workflow.purposes.${workflow.purpose}`) }}
            · {{ t('supplementary_information.completed_at', { date: formatDate(new Date(workflow.completedAt)) }) }}
          </p>
        </header>
        <section
          v-for="collection in workflow.collections"
          :key="collection.id"
          class="space-y-5"
          data-testid="supplementary-collection">
          <header class="space-y-1">
            <p class="text-xs font-medium text-muted">
              {{ t('workflow.step') }} {{ collection.memberSequence }}
            </p>
            <h3 class="text-base font-semibold text-highlighted">
              {{ getBilingualValue(collection, 'name') }}
            </h3>
            <p class="whitespace-pre-wrap break-words text-sm text-muted">
              {{ getBilingualValue(collection, 'description') }}
            </p>
          </header>
          <CommonQuestionnaireReadOnly :definition="collection.definition" :responses="collection.responses" />
        </section>
      </section>
    </template>
  </div>
</template>
