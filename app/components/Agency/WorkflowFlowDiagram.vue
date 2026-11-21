<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { buildWorkflowFlowDefinition, workflowSimulationNodeIds } from '~/utils/workflow-flow-definition'
import type { WorkflowFlowChoices, WorkflowFlowSetup } from '~/utils/workflow-flow-definition'
import type { AgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import type { WorkflowSimulation } from '~~/shared/types/schemas/workflow-simulation'
import { useStatusCatalog } from '~/composables/useStatusCatalog'

const props = defineProps<{
  agencyId: string
  workflowSetupId: string
  setup: WorkflowFlowSetup
  customFields: AgencyCustomFieldDefinition[]
  choices: WorkflowFlowChoices
  simulation?: WorkflowSimulation | null
}>()
const { t, locale } = useI18n()
const catalog = useStatusCatalog()
const flowLocale = computed(() => locale.value === 'fr' ? 'fr' : 'en')
const viewerMode = ref<'usual' | 'bpmn' | 'bpmn-failed' | 'bpmn-reload'>('usual')
const toggle = useTemplateRef<HTMLButtonElement>('viewerToggle')
const filename = computed(() => `workflow-${props.setup.egcs_cn_name_en}`)

watch(() => [props.agencyId, props.workflowSetupId], () => {
  viewerMode.value = 'usual'
})

/** Keeps keyboard focus on the view switch when changing renderers replaces the toolbar. */
const switchViewer = async () => {
  viewerMode.value = viewerMode.value === 'usual' ? 'bpmn' : 'usual'
  await nextTick()
  toggle.value?.focus()
}

/**
 * Restores the usual diagram when BPMN fails.
 * @param phase - Renderer download or diagram rendering.
 */
const restoreUsualViewer = async (phase: 'load' | 'render') => {
  viewerMode.value = phase === 'load' ? 'bpmn-reload' : 'bpmn-failed'
  await nextTick()
  toggle.value?.focus()
}
onMounted(() => {
  void catalog.load()
})
const highlightedNodeIds = computed(() => workflowSimulationNodeIds(props.setup.members, props.simulation))
const definition = computed(() => buildWorkflowFlowDefinition(props.setup, {
  locale: flowLocale.value, t,
  statusName: id => {
    const status = catalog.getById(id)
    return status ? (locale.value === 'fr' ? status.nameFr : status.nameEn) : t('common.unknown')
  },
  customFields: props.customFields, choices: props.choices
}))
</script>

<template>
  <ExtensionSlotHost
    v-if="setup.members.length" slot-name="workflow.flow" subject="agency"
    :agency-id="agencyId" :workflow-setup-id="workflowSetupId" :locale="flowLocale">
    <template #workflow="{ viewer, error, retry }">
      <div v-if="error || viewerMode === 'bpmn-failed' || viewerMode === 'bpmn-reload'" class="mb-2 flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
        {{ t('workflow.flow.bpmn_unavailable') }}
        <span v-if="viewerMode === 'bpmn-reload'">{{ t('workflow.flow.bpmn_reload') }}</span>
        <UButton v-if="error" :label="t('common.retry')" color="neutral" variant="ghost" @click="retry" />
      </div>
      <component
        :is="viewer.component" v-if="viewer && viewerMode === 'bpmn'"
        :key="viewer.extensionKey" :extension-key="viewer.extensionKey"
        :definition="{ graph: definition, tasksByNode: viewer.tasksByNode }"
        :highlighted-node-ids="highlightedNodeIds" :filename="filename"
        @unavailable="restoreUsualViewer">
        <template #toolbar>
          <button ref="viewerToggle" type="button" class="workflow-view-switch" @click="switchViewer">
            {{ t('workflow.flow.usual_view') }}
          </button>
        </template>
      </component>
      <CommonFlowDiagram
        v-else :definition="definition" direction="horizontal" :highlighted-node-ids="highlightedNodeIds"
        :filename="filename">
        <template v-if="viewer" #toolbar>
          <button ref="viewerToggle" type="button" class="workflow-view-switch" @click="switchViewer">
            {{ t('workflow.flow.bpmn_view') }}
          </button>
        </template>
      </CommonFlowDiagram>
    </template>
  </ExtensionSlotHost>
  <p v-else class="text-sm text-muted">
    {{ t('workflow.no_members') }}
  </p>
</template>

<style scoped>
.workflow-view-switch {
  border: 1px solid var(--ui-border-accented);
  border-radius: .375rem;
  padding: .375rem .625rem;
  font-size: .875rem;
  cursor: pointer;
}
.workflow-view-switch:hover {
  background: var(--ui-bg-elevated);
}
.workflow-view-switch:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}
</style>
