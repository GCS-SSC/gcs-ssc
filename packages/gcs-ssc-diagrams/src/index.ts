import type { FlowDiagramProps as ExtensionFlowDiagramProps } from '@gcs-ssc/extensions/ui'

export type {
  FlowDiagramDefinition,
  FlowDiagramNode,
  FlowDiagramRoute,
  FlowDiagramEdgeKind
} from '@gcs-ssc/extensions/ui'

export type FlowDiagramProps = Omit<ExtensionFlowDiagramProps, 'direction'> & {
  direction?: 'auto' | 'horizontal' | 'vertical'
  highlightedNodeIds?: readonly string[]
}

export { flowConnectionPath, flowLaneSpacing } from './connections'
export { diagramSvg, diagramPng } from './export'

export interface FlowDiagramLabels {
  legend: string
  overview: string
  direct: string
  conditional: string
  default: string
  failure: string
  exportSvg: string
  exportPng: string
  exportError: string
  branchOverflow?: string
  zoomIn?: string
  zoomOut?: string
  resetZoom?: string
  enterFullscreen?: string
  exitFullscreen?: string
  addNode?: string
  addBranch?: string
  addFirstNode?: string
}

export { flowBranchLayout } from './branch-layout'
export type { FlowBranchLayout } from './branch-layout'
