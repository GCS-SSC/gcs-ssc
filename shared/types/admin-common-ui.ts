export type AdminCommonGenericItem = { id: string } & Record<string, unknown>

export type AdminCommonEnumName =
  | 'runtime_state'
  | 'publication_state'
  | 'countries'
  | 'entity_type'
  | 'execution_entity_type'
  | 'jurisdiction'
  | 'language_preference'
  | 'review_type'

export interface AdminCommonSelectOption {
  label: string
  value: string
}

export interface AdminCommonLookupConfig {
  fetchUrl: string
  valueKey: string
  labelEnKey: string
  labelFrKey: string
  deleted?: boolean
  query?: Record<string, string | number | boolean>
}

interface AdminCommonFieldBase {
  key: string
  labelKey: string
}

type AdminCommonBasicFieldType = 'text' | 'textarea' | 'json' | 'number' | 'boolean' | 'date'

export type AdminCommonField =
  | AdminCommonFieldBase & {
    type: AdminCommonBasicFieldType
  }
  | AdminCommonFieldBase & {
    type: 'enum'
    enumName: AdminCommonEnumName
    options: AdminCommonSelectOption[]
  }
  | AdminCommonFieldBase & {
    type: 'lookup'
    lookup: AdminCommonLookupConfig
  }

export interface AdminCommonResourceStatsResponse {
  stats?: {
    total?: number
    active?: number
  }
}

export interface AdminCommonLookupResponseItem {
  id: string
  [key: string]: unknown
}

export interface AdminCommonLookupResponse {
  items: AdminCommonLookupResponseItem[]
}
