import type { Component } from 'vue'

export type StatusConfig = {
  color: 'neutral' | 'primary' | 'success' | 'warning' | 'error'
  icon?: string
}

export interface ConfirmDialogProps {
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: 'primary' | 'error' | 'success' | 'warning' | 'info' | 'neutral'
}

export interface ConfirmDialogOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: 'primary' | 'error' | 'success' | 'warning' | 'info' | 'neutral'
}

export interface ColumnVisibilityItem {
  id: string
  columnDef: { header?: string | unknown }
  getCanHide: () => boolean
  getIsVisible: () => boolean
}

export interface TableApiLike {
  getAllColumns: () => ColumnVisibilityItem[]
  getColumn: (id: string) => { toggleVisibility: (visible: boolean) => void } | undefined
}

export interface ToolbarTableLike {
  tableApi?: TableApiLike
}

export interface TranslatedTabItem {
  key: string
  label?: string
  icon?: string
  value: string
}

export interface TranslatedTabsProps {
  items: TranslatedTabItem[]
  variant?: 'link' | 'pill'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  content?: boolean
  mobileCollapsible?: boolean
  mobileAutoCloseOnSelect?: boolean
  ui?: Record<string, string>
}

export type RouteTabDefinition<Props extends Record<string, unknown> = Record<string, unknown>> = {
  key: string
  label?: string
  icon?: string
  value?: string
  component?: Component
  getProps?: () => Props
}

export type TabMap<Props extends Record<string, unknown> = Record<string, unknown>> = Map<
  string,
  RouteTabDefinition<Props>
>
