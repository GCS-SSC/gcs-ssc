import type { AgreementSubmissionTarget } from '~~/shared/types/agreement-submission'
import { appRouteLocations } from './route-locations'

/**
 * Resolves the native Submission workspace or the Agreement history for an unavailable record.
 * @param source - Submission and linked record identities.
 * @param source.agreementId - Owning Agreement.
 * @param source.id - Submission identifier.
 * @param source.target - Target kind.
 * @param source.targetId - Linked financial record if one exists.
 * @returns Destination for the selected Submission.
 */
export const agreementSubmissionLocation = (source: {
  agreementId: string
  id: string
  target: AgreementSubmissionTarget
  targetId: string | null
}) => {
  const { agreementId, id, target, targetId } = source
  if (target === 'claim' && targetId) {
    return { ...appRouteLocations.agreementClaimDetail(agreementId, targetId), query: { section: 'submission' } }
  }
  if (target === 'forecast' && targetId) {
    return { ...appRouteLocations.agreementForecastDetail(agreementId, targetId), query: { section: 'breakdown' } }
  }
  return appRouteLocations.agreementDetail(agreementId, { section: 'submissions', submission: id })
}
