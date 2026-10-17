<script setup lang="ts">
/* eslint-disable jsdoc/require-jsdoc -- component-local rendering and browser lifecycle */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { FlowDiagramDefinition, FlowDiagramProps, FlowDiagramEdgeKind } from '@gcs-ssc/extensions/ui'
import type { FlowDiagramLabels } from './index'
import { flowConnectionPath, flowLaneSpacing } from './connections'
import { flowBranchLayout } from './branch-layout'
import { diagramSvg, diagramPng, downloadDiagram } from './export'

const props = withDefaults(defineProps<{
  definition: FlowDiagramDefinition
  labels: FlowDiagramLabels
  selectedNodeId?: string
  filename?: string
  direction?: 'auto' | 'vertical'
  layout?: 'ordered' | 'branches'
  editable?: boolean
  branchNodeIds?: string[]
}>(), { direction: 'auto', layout: 'ordered', filename: 'diagram' })
const emit = defineEmits<{
  'select-node': [nodeId: string]
  'add-node': [afterNodeId?: string]
  'add-branch': [nodeId: string]
}>()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
const fullscreen = ref(false)
const frameHeight = ref(0)
const frameToolbarHeight = ref(0)
const zoom = ref(1)
const viewScale = zoom
const viewportWidth = ref(0)
const flowSize = ref({ width: 0, height: 0 })
const edges = ref<Array<{ path: string; kind: FlowDiagramEdgeKind }>>([])
const markerId = `flow-arrow-${useId()}`
const branchOverflow = ref(false)
const branchLabelHeights = ref<Record<number, number>>({})
const branchLabelOffsets = ref<Record<string, number>>({})
const branchLayout = computed(() => flowBranchLayout(props.definition))
const branchRailCount = computed(() => props.definition.nodes.reduce((count, node) => count + (node.routes?.filter(route =>
  branchLayout.value.nodes[route.targetId]?.row !== branchLayout.value.nodes[node.id]!.row + 1).length ?? 0), 0))
const incomingRoutes = computed(() => Object.fromEntries(props.definition.nodes.map(node => [node.id,
  props.definition.nodes.flatMap(source => (source.routes ?? []).filter(route => route.targetId === node.id && (route.label || route.detail || route.targetLabel))
    .map(route => ({ sourceId: source.id, sourceTitle: source.title, route })))
])))
const incomingSourceCount = computed(() => Object.fromEntries(props.definition.nodes.map(node => [node.id,
  props.definition.nodes.filter(source => source.routes?.some(route => route.targetId === node.id)).length
])))
const branchStepStyle = (id: string) => props.layout === 'branches'
  ? { gridRow: branchLayout.value.nodes[id]!.row + 1, marginLeft: `${branchLayout.value.nodes[id]!.left}px` }
  : undefined
const exporting = ref(false)
const exportError = ref(false)
const kinds = computed(() => [...new Set(props.definition.nodes.flatMap(node => node.routes?.map(route => route.kind) ?? []))])
const directRoute = (node: FlowDiagramProps['definition']['nodes'][number]) =>
  node.routes?.length === 1 && node.routes[0]?.kind === 'direct' && !node.routes[0].label && !node.routes[0].detail ? node.routes[0] : undefined
const routedCount = computed(() => props.definition.nodes.reduce((count, node, index) =>
  count + (node.routes?.filter((route, routeIndex) => route.targetId !== props.definition.nodes[index + 1]?.id || routeIndex < node.routes!.length - 1).length ?? 0), 0))
let observer: ResizeObserver | undefined
let frame = 0
let branchViewportWidth = 0
let previousOverflow = ''
let previousFocus: HTMLElement | null = null
const toggleFullscreen = async () => {
  if (!surface.value) return
  if (!fullscreen.value) {
    frameHeight.value = surface.value.getBoundingClientRect().height
    frameToolbarHeight.value = surface.value.querySelector<HTMLElement>('.flow-canvas-toolbar')?.getBoundingClientRect().height ?? 0
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fullscreen.value = true
    await nextTick()
    surface.value.querySelector<HTMLElement>('.flow-fullscreen-button')?.focus({ preventScroll: true })
  } else {
    fullscreen.value = false
    document.body.style.overflow = previousOverflow
    await nextTick()
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
  scheduleEdges()
}
const fullscreenKeys = (event: KeyboardEvent) => {
  if (!fullscreen.value || document.querySelector('[role="dialog"]')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    void toggleFullscreen()
  } else if (event.key === 'Tab') {
    const controls = Array.from(surface.value?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])
    const first = controls[0], last = controls.at(-1)
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last?.focus()
    } else if ((!event.shiftKey && active === last) || !surface.value?.contains(active)) {
      event.preventDefault()
      first?.focus()
    }
  }
}
const changeZoom = async (value: number) => {
  const scroll = root.value?.querySelector<HTMLElement>('.flow-scroll')
  const element = canvas.value
  if (!scroll || !element) return
  const bounds = element.getBoundingClientRect()
  const viewport = scroll.getBoundingClientRect()
  const center = { x: viewport.left + scroll.clientLeft + scroll.clientWidth / 2, y: viewport.top + scroll.clientTop + scroll.clientHeight / 2 }
  const focus = { x: (center.x - bounds.left) / zoom.value, y: (center.y - bounds.top) / zoom.value }
  zoom.value = Math.max(0.25, Math.min(2, value))
  await nextTick()
  const resized = element.getBoundingClientRect()
  scroll.scrollLeft += resized.left + focus.x * zoom.value - center.x
  scroll.scrollTop += resized.top + focus.y * zoom.value - center.y
  scheduleEdges()
}
const updateEdges = () => {
  const element = canvas.value
  if (!element) return
  const scrollWidth = root.value?.querySelector<HTMLElement>('.flow-scroll')?.clientWidth ?? 0
  if (scrollWidth && viewportWidth.value !== scrollWidth) {
    viewportWidth.value = scrollWidth
    void nextTick(scheduleEdges)
    return
  }
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
  const measure = (node: Element) => {
    const rect = node.getBoundingClientRect()
    return { left: (rect.left - bounds.left) / viewScale.value, top: (rect.top - bounds.top) / viewScale.value,
      bottom: (rect.bottom - bounds.top) / viewScale.value, width: rect.width / viewScale.value, height: rect.height / viewScale.value }
  }
  if (props.layout === 'branches') {
    const heights: Record<number, number> = {}
    const bottoms = new Map<number, number>()
    for (const [id, node] of destinations) {
      const row = branchLayout.value.nodes[id]!.row
      const step = node.closest('.flow-step')!
      const label = step.querySelector<HTMLElement>('.flow-branch-labels')!
      const children = [...label.children]
      const height = children.reduce((sum, child) => sum + measure(child).height, 0) + Math.max(0, children.length - 1) * (parseFloat(getComputedStyle(label).rowGap) || 0)
      heights[row] = Math.max(heights[row] ?? 0, height)
      bottoms.set(row, Math.max(bottoms.get(row) ?? 0, measure(exporting.value ? node : step).bottom))
    }
    if (JSON.stringify(heights) !== JSON.stringify(branchLabelHeights.value)) {
      branchLabelHeights.value = heights
      void nextTick(scheduleEdges)
      return
    }
    let outsideLane = 0
    const labelRails = new Map<string, number>()
    edges.value = props.definition.nodes.flatMap(node => {
      const source = destinations.get(node.id)
      if (!source) return []
      const from = measure(exporting.value ? source : source.closest('.flow-step')!)
      return (node.routes ?? []).flatMap(route => {
        const target = destinations.get(route.targetId)
        if (!target) return []
        const to = measure(target)
        const targetStep = measure(target.closest('.flow-step')!)
        const start = { x: from.left + from.width / 2, y: from.bottom + 4 }
        const end = { x: to.left + to.width / 2, y: to.top - 8 }
        const adjacent = branchLayout.value.nodes[route.targetId]!.row === branchLayout.value.nodes[node.id]!.row + 1
        const split = bottoms.get(branchLayout.value.nodes[node.id]!.row)! + 28
        const merge = targetStep.top - 24
        const rail = branchLayout.value.width + 24 + (adjacent ? 0 : outsideLane++) * 16
        const joins = props.definition.nodes.filter(candidate => candidate.routes?.some(candidateRoute => candidateRoute.targetId === route.targetId)).length > 1
        const crossbar = joins && node.routes?.length === 1 ? merge : split
        if (route.label || route.detail || route.targetLabel) labelRails.set(route.targetId, Math.max(labelRails.get(route.targetId) ?? -Infinity, adjacent ? crossbar : merge))
        const path = adjacent
          ? `M ${start.x} ${start.y} L ${start.x} ${crossbar} L ${end.x} ${crossbar} L ${end.x} ${end.y}`
          : `M ${start.x} ${start.y} L ${start.x} ${split} L ${rail} ${split} L ${rail} ${merge} L ${end.x} ${merge} L ${end.x} ${end.y}`
        return [{ path, kind: route.kind }]
      })
    })
    const offsets: Record<string, number> = {}
    for (const [id, rail] of labelRails) {
      const target = destinations.get(id)!
      const label = target.closest('.flow-step')!.querySelector<HTMLElement>('.flow-branch-labels')!
      const labelBounds = measure(label)
      const naturalCenter = measure(target.closest('.flow-step')!).top + labelBounds.height / 2
      offsets[id] = Math.round(((rail + measure(target).top - 6) / 2 - naturalCenter) * 100) / 100
    }
    if (JSON.stringify(offsets) !== JSON.stringify(branchLabelOffsets.value)) {
      branchLabelOffsets.value = offsets
      void nextTick(scheduleEdges)
      return
    }
    if (flowSize.value.width !== element.scrollWidth || flowSize.value.height !== element.scrollHeight) {
      flowSize.value = { width: element.scrollWidth, height: element.scrollHeight }
      void nextTick(scheduleEdges)
      return
    }
    const scroll = root.value?.querySelector<HTMLElement>('.flow-scroll')
    branchOverflow.value = !!scroll && element.scrollWidth * viewScale.value + 48 > scroll.clientWidth + 1
    if (scroll && scroll.clientWidth !== branchViewportWidth) {
      const entry = destinations.get(props.selectedNodeId ?? '') ?? destinations.get(props.definition.nodes[0]?.id ?? '')
      if (entry) {
        const position = entry.getBoundingClientRect()
        scroll.scrollLeft += position.left - scroll.getBoundingClientRect().left + position.width / 2 - scroll.clientWidth / 2
      }
      branchViewportWidth = scroll.clientWidth
    }
    return
  }
  const routes = Array.from(element.querySelectorAll<HTMLElement>('[data-flow-destination]'))
  const obstacles = [...destinations.values(), ...routes].map(measure)
  const boundary = vertical
    ? Math.max(...obstacles.map(rect => rect.left + rect.width))
    : Math.max(...obstacles.map(rect => rect.bottom))
  let lane = 0
  edges.value = routes.flatMap(route => {
    const target = destinations.get(route.dataset.flowDestination ?? '')
    if (!target) return []
    const from = measure(route), to = measure(target)
    const adjacent = (route.closest('.flow-step')?.nextElementSibling?.contains(target) ?? false)
      && (!vertical || !route.nextElementSibling)
    return [{ path: flowConnectionPath({
      from: { left: from.left, top: from.top, width: from.width, height: from.height },
      to: { left: to.left, top: to.top, width: to.width, height: to.height },
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
  document.addEventListener('keydown', fullscreenKeys)
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
  document.removeEventListener('keydown', fullscreenKeys)
  if (fullscreen.value) document.body.style.overflow = previousOverflow
  observer?.disconnect()
  if (frame) cancelAnimationFrame(frame)
})
watch(() => [props.definition, props.direction, props.layout, props.editable, props.branchNodeIds], async () => {
  branchViewportWidth = 0
  await nextTick()
  scheduleEdges()
}, { deep: true })
watch(() => props.selectedNodeId, async () => {
  if (props.layout !== 'branches') return
  branchViewportWidth = 0
  await nextTick()
  scheduleEdges()
})
const exportDiagram = async (format: 'svg' | 'png') => {
  if (!root.value || exporting.value) return
  exporting.value = true
  exportError.value = false
  try {
    await document.fonts.ready
    updateEdges()
    await nextTick()
    if (props.layout === 'branches') {
      updateEdges()
      await nextTick()
    }
    const svg = diagramSvg(root.value, props.definition.title)
    downloadDiagram(format === 'svg'
      ? new Blob([svg.source], { type: 'image/svg+xml;charset=utf-8' })
      : await diagramPng(svg), `${props.filename}.${format}`)
  } catch {
    exportError.value = true
  } finally {
    exporting.value = false
    if (props.layout === 'branches') {
      await nextTick()
      scheduleEdges()
    }
  }
}
</script>

<template>
  <section ref="root" class="flow-map" :class="{ 'flow-map--vertical': direction === 'vertical', 'flow-map--branches': layout === 'branches', 'flow-map--fullscreen': fullscreen }" :aria-label="definition.title">
    <div class="flow-heading">
      <p v-if="definition.description" class="flow-description">
        {{ definition.description }}
      </p>
      <div v-if="definition.stats?.length" class="flow-stats">
        <span v-for="stat in definition.stats" :key="stat">{{ stat }}</span>
      </div>
    </div>
    <div class="flow-legend" :aria-label="labels.legend">
      <span v-for="kind in kinds" :key="kind"><i class="flow-legend-line" :class="`flow-legend-line--${kind}`" aria-hidden="true" />{{ labels[kind] }}</span>
    </div>
    <p v-if="definition.orderLabel" class="flow-order-label">
      {{ definition.orderLabel }}
    </p>
    <p v-if="layout === 'branches' && labels.branchOverflow" class="flow-description" :style="branchOverflow ? undefined : { visibility: 'hidden' }" data-export-ignore>
      {{ labels.branchOverflow }}
    </p>
    <div class="flow-frame" :data-flow-toolbar-height="fullscreen ? frameToolbarHeight : undefined" :style="fullscreen ? { height: `${frameHeight}px` } : undefined">
      <div ref="surface" class="flow-surface" :class="{ 'flow-surface--fullscreen': fullscreen }">
        <div class="flow-canvas-toolbar" data-export-ignore>
          <div class="flow-canvas-exports">
            <button type="button" class="flow-export" :disabled="exporting" @click="exportDiagram('svg')">
              {{ labels.exportSvg }}
            </button>
            <button type="button" class="flow-export" :disabled="exporting" @click="exportDiagram('png')">
              {{ labels.exportPng }}
            </button>
          </div>
          <div class="flow-canvas-view-controls">
            <div v-if="labels.zoomIn && labels.zoomOut && labels.resetZoom" class="flow-zoom-controls">
              <button type="button" class="flow-zoom-button" :aria-label="labels.zoomOut" :title="labels.zoomOut" :disabled="zoom <= .25" @click="changeZoom(zoom - .25)">
                <svg class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <button type="button" class="flow-zoom-button flow-zoom-reset" :aria-label="labels.resetZoom" :title="labels.resetZoom" @click="changeZoom(1)">
                <span aria-live="polite" aria-atomic="true">{{ Math.round(zoom * 100) }}%</span>
              </button>
              <button type="button" class="flow-zoom-button" :aria-label="labels.zoomIn" :title="labels.zoomIn" :disabled="zoom >= 2" @click="changeZoom(zoom + .25)">
                <svg class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
              </button>
            </div>
            <button v-if="labels.enterFullscreen && labels.exitFullscreen" type="button" class="flow-zoom-button flow-fullscreen-button" :aria-label="fullscreen ? labels.exitFullscreen : labels.enterFullscreen" :title="fullscreen ? labels.exitFullscreen : labels.enterFullscreen" :aria-expanded="fullscreen" @click="toggleFullscreen">
              <svg class="flow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path :d="fullscreen ? 'M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5' : 'M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5'" /></svg>
            </button>
          </div>
          <p v-if="exportError" role="alert">
            {{ labels.exportError }}
          </p>
        </div>
        <div class="flow-scroll" tabindex="0" :aria-label="labels.overview">
          <div class="flow-stage" :style="{ width: `${flowSize.width * viewScale}px`, height: `${flowSize.height * viewScale}px` }">
            <div ref="canvas" class="flow-canvas" :data-flow-zoom="viewScale" :style="{ '--flow-lanes': routedCount, '--flow-viewport-width': viewportWidth ? `${viewportWidth}px` : '100%', 'transform': `scale(${viewScale})`, ...(layout === 'branches' ? { '--flow-branch-width': `${branchLayout.width}px`, '--flow-branch-rail-space': `${branchRailCount * 16 + 32}px` } : {}) }">
              <svg v-if="edges.length" class="flow-connections" :viewBox="`0 0 ${flowSize.width} ${flowSize.height}`" aria-hidden="true">
                <defs>
                  <marker v-for="kind in kinds" :id="`${markerId}-${kind}`" :key="kind" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" :class="`flow-marker--${kind}`" />
                  </marker>
                </defs>
                <path v-for="(edge, index) in edges" :key="index" :d="edge.path" class="flow-connection" :class="`flow-connection--${edge.kind}`" :marker-end="`url(#${markerId}-${edge.kind})`" />
              </svg>
              <button v-if="editable && labels.addFirstNode" type="button" class="flow-export" data-export-ignore @click="emit('add-node')">
                {{ labels.addFirstNode }}
              </button>
              <ol class="flow-track" :aria-label="definition.orderLabel || definition.title">
                <li v-for="node in definition.nodes" :key="node.id" class="flow-step" :style="branchStepStyle(node.id)" :class="node.kind === 'start' || node.kind === 'end' ? 'flow-terminal' : 'flow-page'">
                  <div v-if="layout === 'branches'" class="flow-branch-labels" :style="{ minHeight: `${branchLabelHeights[branchLayout.nodes[node.id]!.row] ?? 0}px`, marginBottom: branchLabelHeights[branchLayout.nodes[node.id]!.row] ? '1rem' : '0', transform: `translateY(${branchLabelOffsets[node.id] ?? 0}px)` }">
                    <div v-for="({ route, sourceId, sourceTitle }, index) in incomingRoutes[node.id]" :key="`${sourceId}-${index}`" class="flow-route flow-branch-label" :class="`flow-route--${route.kind}`" :data-flow-source="sourceId">
                      <span v-if="incomingSourceCount[node.id]! > 1" class="flow-route-source">{{ sourceTitle }}</span>
                      <span v-if="route.label" class="flow-route-label">{{ route.label }}</span>
                      <span v-if="route.detail" class="flow-route-condition">{{ route.detail }}</span>
                      <span v-if="route.targetLabel" class="flow-route-target">{{ route.targetLabel }}</span>
                    </div>
                  </div>
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
                  <div v-if="layout !== 'branches' && node.routes?.length && !directRoute(node)" class="flow-routes">
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
        </div>
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
.flow-canvas { position: absolute; top: 0; left: 0; width: max-content; min-width: 0; transform-origin: top left; }
.flow-connections { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; color: var(--ui-primary, #008cca); }
.flow-marker--conditional { fill: var(--ui-primary, #008cca); }
.flow-marker--default { fill: var(--ui-text-muted, #a2a3ab); }
.flow-connection { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.flow-connection--direct { stroke: var(--ui-primary, #008cca); stroke-width: 2; opacity: .85; }
.flow-connection--conditional { stroke: var(--ui-primary, #008cca); opacity: .65; }
.flow-connection--default { stroke: var(--ui-text-muted, #a2a3ab); stroke-dasharray: 4 4; opacity: .55; }
.flow-track { display: flex; width: max-content; min-width: 0; align-items: flex-start; gap: 3rem; margin: 0; padding: .5rem 0 calc(min(var(--flow-lanes) * 16px, 160px) + 1.5rem); list-style: none; }
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

.flow-map--vertical .flow-canvas { width: calc(var(--flow-viewport-width) - 3rem); min-width: 0; }
.flow-map--vertical .flow-track { width: 100%; min-width: 0; flex-direction: column; gap: 3rem; padding: .5rem calc(min(var(--flow-lanes) * 8px, 32px) + 1.5rem) .5rem 0; }
.flow-map--vertical .flow-step { width: 100%; max-width: 26rem; }
.flow-map--vertical .flow-terminal-node { width: auto; min-width: 6.5rem; margin-inline: auto; padding: 1rem; }
@container (max-width: 44rem) {

  .flow-canvas { width: calc(var(--flow-viewport-width) - 3rem); min-width: 0; }
  .flow-track { width: 100%; min-width: 0; flex-direction: column; gap: 3rem; padding: .5rem calc(min(var(--flow-lanes) * 16px, 64px) + 2rem) .5rem 0; }
  .flow-step { width: 100%; }
  .flow-terminal-node { width: 6.5rem; margin-inline: auto; }
  .flow-map--vertical .flow-terminal-node { width: auto; }
}
.flow-export { border: 1px solid var(--ui-border); border-radius: .375rem; padding: .4rem .65rem; font-size: .75rem; color: var(--ui-text); cursor: pointer; }
.flow-export:hover { background: var(--ui-bg-elevated); }
.flow-export:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.flow-edit-controls { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
.flow-edit-controls .flow-export:disabled { cursor: not-allowed; }
.flow-export:disabled { opacity: .5; cursor: wait; }
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
.flow-frame { display: block; margin-top: 1rem; }
.flow-surface { display: block; border: 1px solid var(--ui-border, #33343a); border-radius: .75rem; overflow: hidden; background: var(--ui-bg, #1e1e22); }
.flow-canvas-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .5rem; padding: .5rem .75rem; border-bottom: 1px solid var(--ui-border, #33343a); background: var(--ui-bg, #1e1e22); }
.flow-canvas-exports { display: flex; gap: .5rem; margin-inline-end: auto; }
.flow-canvas-view-controls { display: flex; align-items: center; gap: .5rem; }
.flow-canvas-toolbar [role="alert"] { width: 100%; color: var(--ui-error); font-size: .875rem; }
.flow-zoom-controls { display: flex; border: 1px solid var(--ui-border, #33343a); border-radius: .5rem; background: var(--ui-bg, #1e1e22); }
.flow-zoom-button { display: inline-flex; width: 2rem; min-height: 2rem; justify-content: center; align-items: center; border-radius: .375rem; color: var(--ui-text-muted, #a2a3ab); cursor: pointer; }
.flow-zoom-button:hover { color: var(--ui-primary, #008cca); background: var(--ui-bg-elevated, #28282d); }
.flow-zoom-button:focus-visible { outline: 2px solid var(--ui-primary, #008cca); outline-offset: 2px; position: relative; z-index: 1; }
.flow-zoom-button:disabled { opacity: .35; cursor: not-allowed; }
.flow-zoom-reset { width: 3.5rem; border-inline: 1px solid var(--ui-border, #33343a); border-radius: 0; font-size: .75rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.flow-scroll { overflow: auto; min-height: 20rem; max-height: min(70vh, 44rem); padding: 1.5rem; background-color: color-mix(in srgb, var(--ui-bg-elevated, #28282d) 35%, var(--ui-bg, #1e1e22)); background-image: radial-gradient(color-mix(in srgb, var(--ui-primary, #008cca) 16%, transparent) .75px, transparent .75px); background-size: 24px 24px; scrollbar-width: thin; scrollbar-color: var(--ui-primary, #008cca) transparent; }
.flow-map:not(.flow-map--branches) .flow-scroll { min-height: 0; max-height: none; }
.flow-scroll:focus-visible { outline-offset: -3px; }
.flow-scroll::-webkit-scrollbar { width: 7px; height: 7px; }
.flow-scroll::-webkit-scrollbar-track { background: transparent; }
.flow-scroll::-webkit-scrollbar-thumb { border: 1px solid transparent; border-radius: 999px; background: var(--ui-primary, #008cca); background-clip: padding-box; }
.flow-scroll::-webkit-scrollbar-corner { background: transparent; }
.flow-stage { display: block; position: relative; margin-inline: auto; }
.flow-map--branches .flow-canvas { width: max-content; min-width: 0; padding-inline-end: var(--flow-branch-rail-space); }
.flow-map--branches .flow-track { display: grid; grid-template-columns: var(--flow-branch-width); width: var(--flow-branch-width); min-width: 0; align-items: start; gap: 5rem 0; padding: .5rem 0 1rem; }
.flow-map--branches .flow-step { grid-column: 1; width: 264px; max-width: none; }
.flow-terminal-node { flex-direction: row; flex-wrap: wrap; gap: .5rem; width: max-content; min-width: 6.5rem; max-width: 100%; margin-inline: auto; padding: 1rem; }
.flow-terminal-node .flow-page-title { white-space: nowrap; }
.flow-terminal-node .flow-node-line { flex-basis: 100%; text-align: center; }
.flow-branch-labels { display: grid; gap: .5rem; margin-bottom: 1rem; position: relative; }
.flow-branch-label { width: 100%; text-align: center; }
.flow-branch-label::before { content: none; }
.flow-route-source { color: var(--ui-text-muted); font-size: .75rem; font-weight: 600; }
.flow-connection { stroke-width: 2; stroke-linecap: butt; opacity: .85; }
.flow-map--fullscreen { container-type: normal; }
.flow-surface--fullscreen { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; border: 0; border-radius: 0; }
.flow-surface--fullscreen .flow-canvas-toolbar { flex: none; }
.flow-surface--fullscreen .flow-scroll { flex: 1; min-height: 0; max-height: none; }
@media print { .flow-edit-controls, .flow-canvas-toolbar { display: none; } .flow-scroll { overflow: visible; max-height: none; } .flow-stage, .flow-frame { width: auto !important; height: auto !important; } .flow-canvas { position: relative; transform: none !important; } .flow-surface--fullscreen { position: static; display: block; overflow: visible; } }
</style>
