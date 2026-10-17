import type { Component } from 'vue'
import type { FlowDiagramProps } from '@gcs-ssc/extensions/ui'
import type { FlowDiagramLabels } from './index'

declare const FlowDiagram: Component<FlowDiagramProps & { labels: FlowDiagramLabels; layout?: 'ordered' | 'branches' }>
export default FlowDiagram
