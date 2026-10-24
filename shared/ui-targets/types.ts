import type { TargetKind, TargetLedger } from '@gcs-ssc/guided-help/contracts'

export type UiTargetLabel = { en: string; fr: string }
export type UiTargetOwner = { kind: 'host' } | { kind: 'extension'; extensionId: string }

export interface UiTarget {
  key: string
  viewKey: string
  label: UiTargetLabel
  viewLabel: UiTargetLabel
  kind: TargetKind
  owner: UiTargetOwner
  tooltip: boolean
  guidedHelp: boolean
}

export interface UiTargetRegistry {
  formatVersion: 1
  targets: UiTarget[]
}

export interface UiTargetCatalog {
  uiTargetRegistry: UiTargetRegistry
  guidedHelpLedger: TargetLedger
}
