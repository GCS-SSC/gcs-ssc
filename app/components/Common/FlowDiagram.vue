<script setup lang="ts">
import DiagramRenderer from '@gcs-ssc/diagrams/vue'
import type { FlowDiagramDefinition, FlowDiagramLabels } from '@gcs-ssc/diagrams'

defineProps<{
  definition: FlowDiagramDefinition
  selectedNodeId?: string
  filename?: string
  direction?: 'auto' | 'vertical'
}>()
const emit = defineEmits<{ 'select-node': [nodeId: string] }>()
const { t } = useI18n()
const labels = computed<FlowDiagramLabels>(() => ({
  legend: t('diagrams.legend'),
  overview: t('diagrams.overview'),
  direct: t('diagrams.direct'),
  conditional: t('diagrams.conditional'),
  default: t('diagrams.default'),
  failure: t('diagrams.failure'),
  exportSvg: t('diagrams.export_svg'),
  exportPng: t('diagrams.export_png'),
  exportError: t('diagrams.export_error')
}))
</script>

<template>
  <DiagramRenderer
    :definition="definition" :selected-node-id="selectedNodeId" :filename="filename" :direction="direction"
    :labels="labels" @select-node="emit('select-node', $event)" />
</template>
