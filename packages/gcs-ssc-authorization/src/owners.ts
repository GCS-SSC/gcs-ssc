/**
 * The resource that owns an exact runtime item for inherited authorization and roster management.
 *
 * Runtime records such as Reviews and Recommendations may be materialized for different source
 * domains. Keeping that distinction explicit avoids interpreting a nullable agreement id or
 * spreading source-type conditionals across routes.
 */
export type AuthorizationResourceOwner =
  | {
    kind: 'agreement'
    agreementId: string
    agencyId: string
  }
  | {
    kind: 'applicant_recipient'
    applicantRecipientId: string
    agencyId: string
  }
  | {
    kind: 'agency'
    agencyId: string
  }
  | {
    kind: 'transfer_payment_stream'
    agencyId: string
    transferPaymentId: string
    streamId: string
  }

/**
 * Returns the agency boundary shared by every supported runtime owner.
 * @param owner - Discriminated runtime resource owner.
 * @returns Owning agency identifier.
 */
export const getAuthorizationOwnerAgencyId = (
  owner: AuthorizationResourceOwner
): string => owner.agencyId
