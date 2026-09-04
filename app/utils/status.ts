import type { StatusConfig } from '~~/shared/types/ui'

export const STATUS_MAP: Record<string, Record<string, StatusConfig>> = {
  publication_state: {
    draft: { color: 'neutral', icon: 'i-lucide-pencil' },
    published: { color: 'success', icon: 'i-lucide-circle-check' },
    retired: { color: 'neutral', icon: 'i-lucide-archive' }
  },
  runtime_state: {
    pending: { color: 'neutral', icon: 'i-lucide-clock-3' },
    active: { color: 'primary', icon: 'i-lucide-loader-circle' },
    awaiting_action: { color: 'warning', icon: 'i-lucide-hand' },
    paused: { color: 'warning', icon: 'i-lucide-pause-circle' },
    succeeded: { color: 'success', icon: 'i-lucide-circle-check' },
    approved: { color: 'success', icon: 'i-lucide-badge-check' },
    unsuccessful: { color: 'error', icon: 'i-lucide-circle-minus' },
    denied: { color: 'error', icon: 'i-lucide-circle-x' },
    cancelled: { color: 'neutral', icon: 'i-lucide-ban' },
    failed: { color: 'error', icon: 'i-lucide-triangle-alert' }
  },
  follow_up_status: {
    open: { color: 'warning', icon: 'i-lucide-circle-dot' },
    onhold: { color: 'neutral', icon: 'i-lucide-pause-circle' },
    completed: { color: 'success', icon: 'i-lucide-check-circle' },
    cancelled: { color: 'error', icon: 'i-lucide-ban' },
    unabletocomplete: { color: 'error', icon: 'i-lucide-circle-x' }
  }
}

export type BadgeVariantConfig = StatusConfig & {
  labelKey: string
}

export const BADGE_VARIANT_MAP: Record<string, BadgeVariantConfig> = {
  active: { color: 'success', icon: 'i-lucide-check-circle', labelKey: 'common.active' },
  inactive: { color: 'error', icon: 'i-lucide-x-circle', labelKey: 'common.inactive' },
  on_completion: { color: 'primary', icon: 'i-lucide-flag', labelKey: 'transfer_payment.on_completion' },
  sequential: { color: 'neutral', icon: 'i-lucide-list-ordered', labelKey: 'transfer_payment.sequential' },
  verified: { color: 'success', icon: 'i-lucide-badge-check', labelKey: 'user.verified' },
  successful: { color: 'success', icon: 'i-lucide-circle-check', labelKey: 'workflow.successful' },
  unsuccessful: { color: 'error', icon: 'i-lucide-circle-x', labelKey: 'workflow.unsuccessful' },
  unverified: { color: 'neutral', icon: 'i-lucide-badge-x', labelKey: 'user.unverified' },
  yes: { color: 'primary', icon: 'i-lucide-check', labelKey: 'common.yes' },
  no: { color: 'neutral', icon: 'i-lucide-x', labelKey: 'common.no' },
  deleted: { color: 'error', icon: 'i-lucide-trash-2', labelKey: 'common.deleted' },
  not_deleted: { color: 'success', icon: 'i-lucide-check-circle', labelKey: 'common.not_deleted' },
  true: { color: 'success', icon: 'i-lucide-check-circle', labelKey: 'common.true' },
  false: { color: 'neutral', icon: 'i-lucide-circle', labelKey: 'common.false' },
  amount: { color: 'neutral', icon: 'i-lucide-dollar-sign', labelKey: 'common.amount' },
  period: { color: 'neutral', icon: 'i-lucide-calendar-range', labelKey: 'common.period' },
  count: { color: 'neutral', icon: 'i-lucide-list', labelKey: 'common.count' },
  final: { color: 'primary', icon: 'i-lucide-flag', labelKey: 'common.final' },
  meta: { color: 'neutral', icon: 'i-lucide-tag', labelKey: 'common.type' },
  code: { color: 'neutral', icon: 'i-lucide-hash', labelKey: 'common.id' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert', labelKey: 'common.warning' },
  enabled: { color: 'success', icon: 'i-lucide-check-circle', labelKey: 'common.enabled' },
  disabled: { color: 'neutral', icon: 'i-lucide-circle', labelKey: 'common.disabled' },
  certification: { color: 'neutral', icon: 'i-lucide-badge-check', labelKey: 'admin_common.resources.certifications' },
  step: { color: 'neutral', icon: 'i-lucide-list-checks', labelKey: 'admin_common.resources.approval_steps' },
  message: { color: 'neutral', icon: 'i-lucide-message-square', labelKey: 'common.comment' }
}

/**
 * Resolves a status value to a UI presentation configuration.
 *
 * @remarks
 * Falls back to a neutral "unknown" configuration when no mapping exists.
 *
 * @param type - Status group key such as `publication_state`.
 * @param value - Status value such as `active`.
 * @returns Status badge configuration.
 *
 * @example
 * ```typescript
 * const config = getStatusConfig('publication_state', 'published')
 * ```
 */
export const getStatusConfig = (type: string, value: string): StatusConfig => {
  const normalizedType = type.toLowerCase()
  const normalizedValue = value.toLowerCase()
  const config = STATUS_MAP[normalizedType]?.[normalizedValue]

  return config || { color: 'neutral', icon: 'i-lucide-help-circle' }
}

/**
 * Resolves a badge variant to a UI presentation configuration.
 *
 * @param variant - Badge variant key such as `active` or `deleted`.
 * @returns Badge variant configuration with a localized label key.
 */
export const getBadgeVariantConfig = (variant: string): BadgeVariantConfig => {
  const normalizedVariant = variant.toLowerCase()
  return BADGE_VARIANT_MAP[normalizedVariant] || {
    color: 'neutral',
    icon: 'i-lucide-help-circle',
    labelKey: 'common.unknown'
  }
}
