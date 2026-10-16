export type {
  FlowDiagramDefinition,
  FlowDiagramNode,
  FlowDiagramRoute,
  FlowDiagramEdgeKind,
  FlowDiagramProps
} from '@gcs-ssc/extensions/ui'

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
  addNode?: string
  addBranch?: string
  addFirstNode?: string
}
