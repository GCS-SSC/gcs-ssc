import type { Ref } from 'vue'
import { throwFetchResponseError } from '~/utils/fetch-error'
import type { AgencyProfileItem } from '~~/shared/types/schemas'

export interface AgencySaveOptions {
  selectedAgency: Ref<Partial<AgencyProfileItem> | null>
  isSavingAgency: Ref<boolean>
  isModalOpen: Ref<boolean>
  buildRequestUrl: (path: string) => RequestInfo | URL
  refresh: () => Promise<void>
  refreshStatusCatalogAgency?: (agencyId: string) => Promise<void>
  showError: (error: unknown) => void
}

export interface AgencyHeroStatsSource {
  stats?: {
    total?: number | string | null
    active?: number | string | null
  } | null
}

/**
 * Builds the agency create or update request from the current modal state.
 *
 * @param agency - Agency state from the create/update modal.
 * @returns Request path, method, and JSON body.
 */
export const buildAgencySaveRequest = (agency: Partial<AgencyProfileItem>) => ({
  path: agency.id ? `/api/agency/${agency.id}` : '/api/agency',
  method: agency.id ? 'PATCH' as const : 'POST' as const,
  body: agency
})

/**
 * Builds the agencies hero stat rows from the list endpoint response.
 *
 * @param source - Agency list response or missing response value.
 * @param translate - i18n translation function.
 * @returns Hero stat rows for total and active agencies.
 */
export const buildAgencyHeroStats = (
  source: AgencyHeroStatsSource | null | undefined,
  translate: (key: string) => string
) => [
  {
    label: translate('agency.total'),
    value: Number(source?.stats?.total ?? 0)
  },
  {
    label: translate('agency.active_count'),
    value: Number(source?.stats?.active ?? 0),
    accent: true,
    visible: source?.stats?.active !== undefined
  }
]

/**
 * Persists the selected agency and refreshes the agency list on success.
 *
 * @param options - Save state and dependencies from the agencies page.
 */
export const saveAgencyProfile = async (options: AgencySaveOptions) => {
  if (!options.selectedAgency.value || options.isSavingAgency.value) {
    return
  }

  try {
    options.isSavingAgency.value = true
    const request = buildAgencySaveRequest(options.selectedAgency.value)
    const response = await fetch(options.buildRequestUrl(request.path), {
      method: request.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request.body)
    })
    if (!response.ok) {
      await throwFetchResponseError(response)
    }

    if (request.method === 'POST' && options.refreshStatusCatalogAgency) {
      const created = await response.json() as { id?: string | number }
      if (created.id !== undefined) {
        try {
          await options.refreshStatusCatalogAgency(String(created.id))
        } catch (error: unknown) {
          options.showError(error)
        }
      }
    }

    options.isModalOpen.value = false
    try {
      await options.refresh()
    } catch (refreshError) {
      options.showError(refreshError)
    }
  } catch (error: unknown) {
    options.showError(error)
  } finally {
    options.isSavingAgency.value = false
  }
}
