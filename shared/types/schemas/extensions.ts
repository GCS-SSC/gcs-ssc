import { z } from 'zod'
import type { WithId } from './common'
import type {
  GcsExtensionEntityTabTarget,
  GcsExtensionCreateActionMode,
  GcsExtensionCreateOperation,
  GcsExtensionJsonConfig,
  GcsExtensionRbacRequirement,
  GcsClientExtensionManifest,
  GcsExtensionSlot
} from '~~/shared/utils/extensions'
import type { Scope } from '~~/shared/utils/scopes'

export const ExtensionKeySchema = z
  .string({ error: 'validation.required' })
  .min(1, { error: 'validation.required' })
  .max(120)
  .regex(/^[a-z][a-z0-9-]*$/, { error: 'validation.invalid_extension_key' })

export const ExtensionToggleSchema = z.object({
  extensionKey: ExtensionKeySchema,
  enabled: z.boolean(),
  config: z.record(z.string(), z.json()).optional()
})

export const ExtensionMigrationRunSchema = z.object({
  extensionKey: ExtensionKeySchema
})

export const ExtensionStreamConfigurationSchema = z.object({
  extensionKey: ExtensionKeySchema,
  enabled: z.boolean(),
  config: z.record(z.string(), z.json()).default({})
})

export type ExtensionAgencyEnablementInput = z.infer<typeof ExtensionToggleSchema>
export type ExtensionMigrationRunInput = z.infer<typeof ExtensionMigrationRunSchema>
export type ExtensionStreamConfigurationInput = z.infer<typeof ExtensionStreamConfigurationSchema>

export type ExtensionAgencyEnablementItem = WithId<{
  extension_key: string
  agency_id: string
  enabled: boolean
  config: GcsExtensionJsonConfig
}>

export type ExtensionStreamConfigurationItem = WithId<{
  extension_key: string
  stream_id: string
  enabled: boolean
  config: GcsExtensionJsonConfig
}>

export interface ExtensionAgencyRegistryItem {
  extension: GcsClientExtensionManifest
  hasMigrations: boolean
  enabled: boolean
  config: GcsExtensionJsonConfig
  storageProvider?: {
    selected: boolean
  }
}

export interface ExtensionStreamRegistryItem {
  extension: GcsClientExtensionManifest
  agencyEnabled: boolean
  streamEnabled: boolean
  config: GcsExtensionJsonConfig
}

export interface ExtensionRuntimeSlotItem {
  extensionKey: string
  componentName: string
  config: GcsExtensionJsonConfig
}

export interface ExtensionRuntimeResponse {
  slot: GcsExtensionSlot
  streamId?: string
  items: ExtensionRuntimeSlotItem[]
}

export interface ExtensionEntityTabContext {
  target: GcsExtensionEntityTabTarget
  agencyId: string
  streamId?: string
  agreementId?: string
  applicantRecipientId?: string
  claimId?: string
  monitorId?: string
  ownerType: string
  ownerId: string
  scope: Scope
}

export interface ExtensionEntityTabItem {
  extensionKey: string
  tabId: string
  value: string
  label: {
    en: string
    fr: string
  }
  icon?: string
  componentName: string
  config: GcsExtensionJsonConfig
  context: ExtensionEntityTabContext
  rbac: GcsExtensionRbacRequirement
}

export interface ExtensionEntityTabsResponse {
  target: GcsExtensionEntityTabTarget
  items: ExtensionEntityTabItem[]
}

export interface ExtensionCreateActionContext {
  operation: GcsExtensionCreateOperation
  agencyId: string
  streamId: string
  agreementId: string
  scope: Scope
}

export interface ExtensionCreateActionItem {
  extensionKey: string
  actionId: string
  operation: GcsExtensionCreateOperation
  mode: GcsExtensionCreateActionMode
  value: string
  label: {
    en: string
    fr: string
  }
  icon?: string
  componentName: string
  config: GcsExtensionJsonConfig
  context: ExtensionCreateActionContext
  rbac: GcsExtensionRbacRequirement
}

export interface ExtensionCreateActionsResponse {
  operation: GcsExtensionCreateOperation
  items: ExtensionCreateActionItem[]
  conflict: boolean
  conflictCode?: string
}

export interface ExtensionPaymentAmountCalculatorContext {
  operation: 'agreement.payments.create'
  agencyId: string
  streamId: string
  agreementId: string
  scope: Scope
}

export interface ExtensionPaymentAmountCalculatorItem {
  extensionKey: string
  calculatorId: string
  operation: 'agreement.payments.create'
  value: string
  label: {
    en: string
    fr: string
  }
  componentName: string
  config: GcsExtensionJsonConfig
  context: ExtensionPaymentAmountCalculatorContext
  rbac: GcsExtensionRbacRequirement
}

export interface ExtensionPaymentAmountCalculatorsResponse {
  operation: 'agreement.payments.create'
  items: ExtensionPaymentAmountCalculatorItem[]
  conflict: boolean
  conflictCode?: string
}
