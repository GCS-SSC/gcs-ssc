import type { Component } from 'vue'
import type { FlowDiagramLabels, FlowDiagramProps } from './index'

declare const FlowDiagram: Component<FlowDiagramProps & { labels: FlowDiagramLabels; layout?: 'ordered' | 'branches' }>
export default FlowDiagram
