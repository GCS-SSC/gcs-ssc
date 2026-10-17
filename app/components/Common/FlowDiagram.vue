<script setup lang="ts">
import DiagramRenderer from '@gcs-ssc/diagrams/vue'
import type { FlowDiagramDefinition, FlowDiagramLabels } from '@gcs-ssc/diagrams'

defineProps<{
  definition: FlowDiagramDefinition
  selectedNodeId?: string
  filename?: string
  direction?: 'auto' | 'vertical'
  layout?: 'ordered' | 'branches'
  editable?: boolean
  branchNodeIds?: string[]
}>()
const emit = defineEmits<{
  'select-node': [nodeId: string]
  'add-node': [afterNodeId?: string]
  'add-branch': [nodeId: string]
}>()
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
  exportError: t('diagrams.export_error'),
  branchOverflow: t('diagrams.branch_overflow'),
  zoomIn: t('diagrams.zoom_in'),
  zoomOut: t('diagrams.zoom_out'),
  resetZoom: t('diagrams.reset_zoom'),
  enterFullscreen: t('diagrams.enter_fullscreen'),
  exitFullscreen: t('diagrams.exit_fullscreen'),
  addNode: t('diagrams.add_node'),
  addBranch: t('diagrams.add_branch'),
  addFirstNode: t('diagrams.add_first_node')
}))
</script>

<template>
  <DiagramRenderer
    :definition="definition" :selected-node-id="selectedNodeId" :filename="filename" :direction="direction"
    :labels="labels" :layout="layout" :editable="editable" :branch-node-ids="branchNodeIds"
    @select-node="emit('select-node', $event)" @add-node="emit('add-node', $event)" @add-branch="emit('add-branch', $event)" />
</template>
