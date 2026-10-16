<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- component-local rendering and browser lifecycle */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { FlowDiagramDefinition, FlowDiagramProps, FlowDiagramEdgeKind } from '@gcs-ssc/extensions/ui'
import type { FlowDiagramLabels } from './index'
import { flowConnectionPath, flowLaneSpacing } from './connections'
import { diagramSvg, diagramPng, downloadDiagram } from './export'

const props = withDefaults(defineProps<{
  definition: FlowDiagramDefinition
  labels: FlowDiagramLabels
  selectedNodeId?: string
  filename?: string
  direction?: 'auto' | 'vertical'
  editable?: boolean
  branchNodeIds?: string[]
}>(), { direction: 'auto', filename: 'diagram' })
const emit = defineEmits<{
  'select-node': [nodeId: string]
  'add-node': [afterNodeId?: string]
  'add-branch': [nodeId: string]
}>()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const flowSize = ref({ width: 0, height: 0 })
const edges = ref<Array<{ path: string; kind: FlowDiagramEdgeKind }>>([])
const markerId = `flow-arrow-${useId()}`
const exporting = ref(false)
const exportError = ref(false)
const kinds = computed(() => [...new Set(props.definition.nodes.flatMap(node => node.routes?.map(route => route.kind) ?? []))])
const directRoute = (node: FlowDiagramProps['definition']['nodes'][number]) =>
  node.routes?.length === 1 && node.routes[0]?.kind === 'direct' && !node.routes[0].label && !node.routes[0].detail ? node.routes[0] : undefined
const routedCount = computed(() => props.definition.nodes.reduce((count, node, index) =>
  count + (node.routes?.filter((route, routeIndex) => route.targetId !== props.definition.nodes[index + 1]?.id || routeIndex < node.routes!.length - 1).length ?? 0), 0))
let observer: ResizeObserver | undefined
let frame = 0
const updateEdges = () => {
  const element = canvas.value
  if (!element) return
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) {
    edges.value = []
    return
  }
  const track = element.querySelector<HTMLElement>('.flow-track')
  if (!track) return
  const vertical = getComputedStyle(track).flexDirection === 'column'
  const destinations = new Map(Array.from(element.querySelectorAll<HTMLElement>('[data-flow-node]'))
    .map(node => [node.dataset.flowNode!, node] as const))
  const routes = Array.from(element.querySelectorAll<HTMLElement>('[data-flow-destination]'))
  const obstacles = [...destinations.values(), ...routes].map(node => node.getBoundingClientRect())
  const boundary = vertical
    ? Math.max(...obstacles.map(rect => rect.right - bounds.left))
    : Math.max(...obstacles.map(rect => rect.bottom - bounds.top))
  let lane = 0
  edges.value = routes.flatMap(route => {
    const target = destinations.get(route.dataset.flowDestination ?? '')
    if (!target) return []
    const from = route.getBoundingClientRect(), to = target.getBoundingClientRect()
    const adjacent = (route.closest('.flow-step')?.nextElementSibling?.contains(target) ?? false)
      && (!vertical || !route.nextElementSibling)
    return [{ path: flowConnectionPath({
      from: { left: from.left - bounds.left, top: from.top - bounds.top, width: from.width, height: from.height },
      to: { left: to.left - bounds.left, top: to.top - bounds.top, width: to.width, height: to.height },
      vertical, routed: !adjacent, lane: adjacent ? 0 : lane++, boundary,
      laneSpacing: flowLaneSpacing(routedCount.value, vertical) * (vertical && props.direction === 'vertical' ? 0.5 : 1)
    }), kind: route.dataset.flowKind as FlowDiagramEdgeKind }]
  })
  flowSize.value = { width: element.scrollWidth, height: element.scrollHeight }
}
const scheduleEdges = () => {
  if (typeof requestAnimationFrame !== 'function') {
    updateEdges()
    return
  }
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    frame = 0
    updateEdges()
  })
}
onMounted(async () => {
  await nextTick()
  scheduleEdges()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleEdges)
    if (canvas.value) observer.observe(canvas.value)
    if (root.value) observer.observe(root.value)
  }
  document.fonts?.ready.then(scheduleEdges)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})
watch(() => [props.definition, props.direction, props.editable, props.branchNodeIds], async () => {
  await nextTick()
  scheduleEdges()
}, { deep: true })
const exportDiagram = async (format: 'svg' | 'png') => {
  if (!root.value || exporting.value) return
  exporting.value = true
  exportError.value = false
  try {
    await document.fonts.ready
    updateEdges()
    await nextTick()
    const svg = diagramSvg(root.value, props.definition.title)
    downloadDiagram(format === 'svg'
      ? new Blob([svg.source], { type: 'image/svg+xml;charset=utf-8' })
      : await diagramPng(svg), `${props.filename}.${format}`)
  } catch {
    exportError.value = true
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <section ref="root" class="flow-map" :class="{ 'flow-map--vertical': direction === 'vertical' }" :aria-label="definition.title">
    <div class="flow-heading">
      <p v-if="definition.description" class="flow-description">
        {{ definition.description }}
      </p>
      <div v-if="definition.stats?.length" class="flow-stats">
        <span v-for="stat in definition.stats" :key="stat">{{ stat }}</span>
      </div>
    </div>
    <div class="flow-toolbar" data-export-ignore>
      <button type="button" class="flow-export" :disabled="exporting" @click="exportDiagram('svg')">
        {{ labels.exportSvg }}
      </button>
      <button type="button" class="flow-export" :disabled="exporting" @click="exportDiagram('png')">
        {{ labels.exportPng }}
      </button>
      <p v-if="exportError" role="alert">
        {{ labels.exportError }}
      </p>
    </div>
    <div class="flow-legend" :aria-label="labels.legend">
      <span v-for="kind in kinds" :key="kind"><i class="flow-legend-line" :class="`flow-legend-line--${kind}`" aria-hidden="true" />{{ labels[kind] }}</span>
    </div>
    <p v-if="definition.orderLabel" class="flow-order-label">
      {{ definition.orderLabel }}
    </p>
    <div class="flow-scroll" tabindex="0" :aria-label="labels.overview">
      <div ref="canvas" class="flow-canvas" :style="{ '--flow-lanes': routedCount }">
        <svg v-if="edges.length" class="flow-connections" :viewBox="`0 0 ${flowSize.width} ${flowSize.height}`" aria-hidden="true">
          <defs>
            <marker v-for="kind in kinds" :id="`${markerId}-${kind}`" :key="kind" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" :class="`flow-marker--${kind}`" />
            </marker>
          </defs>
          <path v-for="(edge, index) in edges" :key="index" :d="edge.path" class="flow-connection" :class="`flow-connection--${edge.kind}`" :marker-end="`url(#${markerId}-${edge.kind})`" />
        </svg>
        <button v-if="editable && labels.addFirstNode" type="button" class="flow-export" data-export-ignore @click="emit('add-node')">
          {{ labels.addFirstNode }}
        </button>
        <ol class="flow-track" :aria-label="definition.orderLabel || definition.title">
          <li v-for="node in definition.nodes" :key="node.id" class="flow-step" :class="node.kind === 'start' || node.kind === 'end' ? 'flow-terminal' : 'flow-page'">
            <span v-if="node.kind === 'decision' && node.eyebrow" class="flow-decision-label">{{ node.eyebrow }}</span>
            <component
              :is="node.selectLabel ? 'button' : 'div'" :type="node.selectLabel ? 'button' : undefined"
              :class="node.kind === 'start' || node.kind === 'end' ? ['flow-terminal-node', `flow-terminal-node--${node.kind}`] : ['flow-page-node', { 'flow-page-node--decision': node.kind === 'decision' }]"
              :data-flow-node="node.id" :data-flow-destination="directRoute(node)?.targetId" :data-flow-kind="directRoute(node)?.kind"
              :aria-current="selectedNodeId === node.id ? 'step' : undefined" :aria-label="node.selectLabel"
              @click="node.selectLabel && emit('select-node', node.id)">
              <svg v-if="node.kind === 'start' || node.kind === 'end'" class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path :d="node.kind === 'start' ? 'm6 3 14 9-14 9V3Z' : 'M4 22V3m0 0c4-3 8 3 12 0v10c-4 3-8-3-12 0'" />
              </svg>
              <span v-if="node.eyebrow && node.kind !== 'decision'" class="flow-page-index">{{ node.eyebrow }}</span>
              <strong class="flow-page-title">{{ node.title }}</strong>
              <span v-for="(line, index) in node.kind === 'decision' ? [] : node.lines" :key="index" class="flow-node-line">{{ line }}</span>
              <svg v-if="node.selectLabel" class="flow-page-edit flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>
            </component>
            <span v-for="(line, index) in node.kind === 'decision' ? node.lines : []" :key="index" class="flow-node-line flow-decision-line">{{ line }}</span>
            <div v-if="editable && node.kind !== 'end'" class="flow-edit-controls" data-export-ignore>
              <button v-if="labels.addNode" type="button" class="flow-export" :aria-label="`${labels.addNode}: ${node.title}`" @click="emit('add-node', node.id)">
                {{ labels.addNode }}
              </button>
              <button v-if="labels.addBranch" type="button" class="flow-export" :aria-label="`${labels.addBranch}: ${node.title}`" :disabled="branchNodeIds !== undefined && !branchNodeIds.includes(node.id)" @click="emit('add-branch', node.id)">
                {{ labels.addBranch }}
              </button>
            </div>
            <div v-if="node.routes?.length && !directRoute(node)" class="flow-routes">
              <div
                v-for="(route, index) in node.routes" :key="index" class="flow-route" :class="`flow-route--${route.kind}`"
                :data-flow-destination="route.targetId" :data-flow-kind="route.kind">
                <span v-if="route.label" class="flow-route-label">{{ route.label }}</span>
                <span v-if="route.detail" class="flow-route-condition">{{ route.detail }}</span>
                <span v-if="route.targetLabel" class="flow-route-target">
                  <svg class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 10h9l-4-4m4 4-4 4M6 3v4a3 3 0 0 0 3 3" /></svg>{{ route.targetLabel }}
                </span>
              </div>
            </div>
          </li>
        </ol>
      </div>
    </div>
    <p v-if="definition.selectHint" class="flow-hint">
      <svg class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 3 7 18 3-8 8-3L3 3Z" /></svg>
      {{ definition.selectHint }}
    </p>
  </section>
</template>

<style scoped>
.flow-map { min-width: 0; container-type: inline-size; }
.flow-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.flow-description { max-width: 42rem; color: var(--ui-text-muted, #a2a3ab); font-size: .875rem; line-height: 1.5; }
.flow-stats { display: flex; gap: .5rem; color: var(--ui-text-muted, #a2a3ab); font-size: .75rem; }
.flow-stats span { padding: .45rem .7rem; border: 1px solid var(--ui-border, #33343a); border-radius: 999px; white-space: nowrap; }
.flow-stats strong { color: var(--ui-primary, #008cca); font-size: .875rem; }
.flow-legend { display: flex; flex-wrap: wrap; gap: .5rem 1rem; margin-top: 1rem; color: var(--ui-text-muted, #a2a3ab); font-size: .72rem; }
.flow-legend span { display: inline-flex; align-items: center; gap: .4rem; }
.flow-legend-line { width: 1.25rem; border-top: 2px solid var(--ui-primary, #008cca); }
.flow-legend-line--direct { border-width: 2px; }
.flow-legend-line--default { border-color: var(--ui-text-muted, #a2a3ab); border-top-style: dashed; }
.flow-order-label { margin-top: 1.5rem; color: var(--ui-text-muted, #a2a3ab); font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
.flow-scroll { overflow-x: auto; padding: 1rem 0 1.5rem; }
.flow-scroll:focus-visible { outline: 2px solid var(--ui-primary, #008cca); outline-offset: 2px; }
.flow-canvas { position: relative; width: max-content; min-width: 100%; }
.flow-connections { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; color: var(--ui-primary, #008cca); }
.flow-marker--conditional { fill: var(--ui-primary, #008cca); }
.flow-marker--default { fill: var(--ui-text-muted, #a2a3ab); }
.flow-connection { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.flow-connection--direct { stroke: var(--ui-primary, #008cca); stroke-width: 2; opacity: .85; }
.flow-connection--conditional { stroke: var(--ui-primary, #008cca); opacity: .65; }
.flow-connection--default { stroke: var(--ui-text-muted, #a2a3ab); stroke-dasharray: 4 4; opacity: .55; }
.flow-track { display: flex; width: max-content; min-width: 100%; align-items: flex-start; gap: 3rem; margin: 0; padding: .5rem 0 calc(min(var(--flow-lanes) * 16px, 160px) + 1.5rem); list-style: none; }
.flow-step { position: relative; flex: none; }
.flow-page { width: 16.5rem; }
.flow-terminal { width: 6.5rem; }
.flow-terminal-node { display: flex; min-height: 5.5rem; flex-direction: column; align-items: center; justify-content: center; gap: .3rem; border: 1px solid var(--ui-primary, #008cca); border-radius: 1rem; background: color-mix(in srgb, var(--ui-primary, #008cca) 10%, var(--ui-bg, #1e1e22)); color: var(--ui-primary, #008cca); font-size: .75rem; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
.flow-terminal-node--end { border-color: var(--ui-border, #33343a); background: var(--ui-bg-elevated, #28282d); color: var(--ui-text, #e8e8ec); }
.flow-page-node { position: relative; display: flex; width: 100%; min-height: 5.5rem; flex-direction: column; align-items: flex-start; justify-content: center; gap: .35rem; padding: .85rem 2.25rem .85rem 1rem; border: 1px solid var(--ui-border, #33343a); border-inline-start: .25rem solid var(--ui-primary, #008cca); border-radius: .5rem; background: var(--ui-bg-elevated, #28282d); text-align: start; transition: border-color .15s ease, background .15s ease, transform .15s ease; }
.flow-page-node:hover, .flow-page-node:focus-visible { border-color: var(--ui-primary, #008cca); background: color-mix(in srgb, var(--ui-primary, #008cca) 12%, var(--ui-bg-elevated, #28282d)); }
.flow-page-node:focus-visible { outline: 2px solid var(--ui-primary, #008cca); outline-offset: 2px; }
.flow-page-node[aria-current="step"] { background: color-mix(in srgb, var(--ui-primary, #008cca) 15%, var(--ui-bg-elevated, #28282d)); }
.flow-page-index { color: var(--ui-primary, #008cca); font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
.flow-page-title { max-width: 100%; color: var(--ui-text, #e8e8ec); font-size: .9rem; line-height: 1.35; }
.flow-page-edit { position: absolute; inset-inline-end: .8rem; top: .8rem; color: var(--ui-primary, #008cca); }
.flow-routes { display: grid; gap: .65rem; margin: 1.25rem 0 0 .75rem; padding-inline-start: 1rem; border-inline-start: 2px solid var(--ui-border, #33343a); }
.flow-route { position: relative; display: grid; gap: .4rem; min-width: 0; padding: .75rem .85rem; border: 1px solid var(--ui-border, #33343a); border-radius: .4rem; background: var(--ui-bg, #1e1e22); font-size: .75rem; line-height: 1.4; }
.flow-route::before { position: absolute; top: 1rem; inset-inline-start: -1.35rem; width: .55rem; height: .55rem; border-radius: 999px; background: var(--ui-text-muted, #a2a3ab); content: ''; }
.flow-route--conditional { border-color: color-mix(in srgb, var(--ui-primary, #008cca) 55%, var(--ui-border, #33343a)); }
.flow-route--conditional::before { background: var(--ui-primary, #008cca); }
.flow-route-label { color: var(--ui-text-muted, #a2a3ab); font-size: .65rem; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; }
.flow-route--conditional .flow-route-label { color: var(--ui-primary, #008cca); }
.flow-route-condition { overflow-wrap: anywhere; color: var(--ui-text, #e8e8ec); }
.flow-route-target { display: flex; min-width: 0; align-items: flex-start; gap: .35rem; overflow-wrap: anywhere; color: var(--ui-primary, #008cca); font-weight: 700; }
.flow-route--default .flow-route-target { color: var(--ui-text, #e8e8ec); }
.flow-hint { display: flex; align-items: center; gap: .4rem; margin-top: .5rem; color: var(--ui-text-muted, #a2a3ab); font-size: .75rem; }
.flow-map--vertical .flow-scroll { overflow-x: visible; }
.flow-map--vertical .flow-canvas { width: 100%; min-width: 0; }
.flow-map--vertical .flow-track { width: 100%; min-width: 0; flex-direction: column; gap: 3rem; padding: .5rem calc(min(var(--flow-lanes) * 8px, 32px) + 1.5rem) .5rem 0; }
.flow-map--vertical .flow-step { width: 100%; max-width: 26rem; }
.flow-map--vertical .flow-terminal-node { width: auto; min-width: 6.5rem; margin-inline: auto; padding: 1rem; }
@container (max-width: 44rem) {
  .flow-scroll { overflow-x: visible; }
  .flow-canvas { width: 100%; min-width: 0; }
  .flow-track { width: 100%; min-width: 0; flex-direction: column; gap: 3rem; padding: .5rem calc(min(var(--flow-lanes) * 16px, 64px) + 2rem) .5rem 0; }
  .flow-step { width: 100%; }
  .flow-terminal-node { width: 6.5rem; margin-inline: auto; }
  .flow-map--vertical .flow-terminal-node { width: auto; }
}
.flow-toolbar { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
.flow-export { border: 1px solid var(--ui-border); border-radius: .375rem; padding: .4rem .65rem; font-size: .75rem; color: var(--ui-text); cursor: pointer; }
.flow-export:hover { background: var(--ui-bg-elevated); }
.flow-export:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.flow-edit-controls { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
.flow-edit-controls .flow-export:disabled { cursor: not-allowed; }
.flow-export:disabled { opacity: .5; cursor: wait; }
.flow-toolbar [role="alert"] { color: var(--ui-error); width: 100%; font-size: .875rem; }
.flow-icon { width: 1rem; height: 1rem; flex-shrink: 0; }
.flow-terminal-node .flow-page-title { color: inherit; font-size: inherit; line-height: inherit; }
.flow-node-line { text-transform: none; letter-spacing: normal; font-weight: 400; color: var(--ui-text-muted); font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.flow-page-node:not(button):hover { border-color: var(--ui-border); background: var(--ui-bg-elevated); }
.flow-page-node--decision { border-radius: 0; border-inline-start-width: 1px; min-height: 9rem; align-items: center; text-align: center; padding: 2rem 3rem; background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg)); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.flow-page-node--decision .flow-page-title { max-width: 65%; }
.flow-decision-label { display: block; margin-bottom: .5rem; color: var(--ui-primary); font-size: .65rem; font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: .1em; }
.flow-decision-line { display: block; margin-top: .5rem; text-align: center; }
.flow-marker--direct, .flow-marker--conditional { fill: var(--ui-primary, #008cca); }
.flow-marker--failure { fill: var(--ui-error, #ef4444); }
.flow-connection--failure { stroke: var(--ui-error, #ef4444); stroke-dasharray: 2 3; opacity: .7; }
.flow-legend-line--failure { border-color: var(--ui-error, #ef4444); border-top-style: dotted; }
.flow-route--failure { border-color: color-mix(in srgb, var(--ui-error) 40%, var(--ui-border)); }
.flow-route--failure::before { background: var(--ui-error); }
.flow-route--failure .flow-route-label, .flow-route--failure .flow-route-target { color: var(--ui-error); }
@media print { .flow-toolbar, .flow-edit-controls { display: none; } .flow-scroll { overflow: visible; } }
</style>
