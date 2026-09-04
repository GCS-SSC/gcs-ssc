export interface AgreementMonitorResourceSaveRequest {
  url: string
  method: 'PATCH' | 'POST'
}

export type AgreementMonitorResourcePath =
  | 'monitor-planning'
  | 'monitor-items'
  | 'monitor-findings'
  | 'monitor-followups'
  | 'monitor-followup-updates'
  | 'monitor-promising-practices'

/**
 * Builds the API request for saving a monitor child resource.
 *
 * @param agreementId - Agreement id.
 * @param path - Monitor child API path segment.
 * @param resourceId - Existing resource id, when updating.
 * @returns URL and method for the save request.
 */
export const buildAgreementMonitorResourceSaveRequest = (
  agreementId: string,
  path: AgreementMonitorResourcePath,
  resourceId?: string | number
): AgreementMonitorResourceSaveRequest => {
  const hasResourceId = resourceId !== undefined && resourceId !== null

  return {
    url: hasResourceId ? `/api/agreements/${agreementId}/${path}/${resourceId}` : `/api/agreements/${agreementId}/${path}`,
    method: hasResourceId ? 'PATCH' : 'POST'
  }
}
