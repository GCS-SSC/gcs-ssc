<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { buildWorkflowFlowDefinition } from '~/utils/workflow-flow-definition'
import type { WorkflowFlowChoices, WorkflowFlowSetup } from '~/utils/workflow-flow-definition'
import type { AgencyCustomFieldDefinition } from '~~/shared/types/schemas/agreement-custom-fields'
import { useStatusCatalog } from '~/composables/useStatusCatalog'

const props = defineProps<{
  setup: WorkflowFlowSetup
  customFields: AgencyCustomFieldDefinition[]
  choices: WorkflowFlowChoices
}>()
const { t, locale } = useI18n()
const catalog = useStatusCatalog()
onMounted(() => {
  void catalog.load()
})
const definition = computed(() => buildWorkflowFlowDefinition(props.setup, {
  locale: locale.value === 'fr' ? 'fr' : 'en', t,
  statusName: id => {
    const status = catalog.getById(id)
    return status ? (locale.value === 'fr' ? status.nameFr : status.nameEn) : t('common.unknown')
  },
  customFields: props.customFields, choices: props.choices
}))
</script>

<template>
  <CommonFlowDiagram
    v-if="setup.members.length"
    :definition="definition" direction="vertical" :filename="`workflow-${setup.egcs_cn_name_en}`" />
  <p v-else class="text-sm text-muted">
    {{ t('workflow.no_members') }}
  </p>
</template>
