import type { TransferPaymentProfileForm } from '~~/shared/types/transfer-payment-ui'

export interface TransferPaymentProfileSaveRequest {
  url: string
  method: 'PATCH' | 'POST'
  body: Record<string, unknown>
  isUpdate: boolean
}

interface CompleteTransferPaymentProfileSaveOptions {
  isUpdate: boolean
  close: () => void
  refresh: () => Promise<void> | void
  t: (key: string) => string
  toast: {
    add: (notification: { title: string, description: string, color: 'success' }) => void
  }
}

export interface TransferPaymentHeroStatsSource {
  stats?: {
    total?: number | string | null
    active?: number | string | null
  } | null
}

/**
 * Builds the API request shape for saving a transfer payment profile.
 *
 * @param payload - Current transfer payment profile form payload.
 * @param agencyId - Optional agency id to force into the request body.
 * @returns URL, method, body, and update flag for the save request.
 */
export const buildTransferPaymentProfileSaveRequest = (
  payload: TransferPaymentProfileForm,
  agencyId?: string
): TransferPaymentProfileSaveRequest => {
  const isUpdate = Boolean(payload.id)
  return {
    url: isUpdate ? `/api/transfer-payments/${payload.id}` : '/api/transfer-payments',
    method: isUpdate ? 'PATCH' : 'POST',
    body: {
      ...payload,
      ...(agencyId ? { egcs_tp_agency: agencyId } : {})
    },
    isUpdate
  }
}

/**
 * Closes the profile modal, refreshes data, and shows the standard save toast.
 *
 * @param options - Save completion callbacks and i18n/toast dependencies.
 * @returns Promise resolved after refresh and toast.
 */
export const completeTransferPaymentProfileSave = async (
  options: CompleteTransferPaymentProfileSaveOptions
): Promise<void> => {
  options.close()
  options.toast.add({
    title: options.t('common.success'),
    description: options.t(options.isUpdate ? 'common.updated_success' : 'common.added_success'),
    color: 'success'
  })
  await options.refresh()
}

/**
 * Builds the transfer payment profile hero stat rows from the list response.
 *
 * @param source - Transfer payment list response or missing response value.
 * @param translate - i18n translation function.
 * @returns Hero stat rows for total and active profiles.
 */
export const buildTransferPaymentHeroStats = (
  source: TransferPaymentHeroStatsSource | null | undefined,
  translate: (key: string) => string
) => [
  {
    label: translate('transfer_payment.title'),
    value: Number(source?.stats?.total ?? 0)
  },
  {
    label: translate('transfer_payment.active_count'),
    value: Number(source?.stats?.active ?? 0),
    accent: true,
    visible: source?.stats?.active !== undefined
  }
]
