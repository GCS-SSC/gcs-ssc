/* eslint-disable jsdoc/require-jsdoc -- Funding-history route helpers are covered by focused route tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { AuthContext } from '~~/server/utils/authorize'
import { canAccessAgreement, buildAgreementScope } from '~~/server/utils/agreement'
import { canAccessApplicantRecipientIds } from '~~/server/utils/applicant-recipient-auth'
import { badRequest, notFound, throwApiError } from '~~/server/utils/api-errors'
import {
  createFundingHistoryWarningFingerprint,
  findFundingHistoryNameCandidates,
  getUnconfirmedFundingHistoryWarnings,
  isNearFundingAgreementNumber,
  normalizeFundingAgreementNumber,
  type FundingHistorySimilarityWarning
} from '~~/shared/utils/funding-history-matching'

export interface FundingHistoryIdentityInput {
  egcs_ar_agencyname_en?: string
  egcs_ar_agencyname_fr?: string
  egcs_ar_programname_en?: string
  egcs_ar_programname_fr?: string
  egcs_ar_agreementnumber?: string
}

export interface FundingHistorySimilarityOptions {
  proposedSource?: 'external' | 'system'
  excludeHistoryId?: string
  excludeAgreementId?: string
}

interface FundingAgreementCandidate {
  source: 'external' | 'system'
  candidateId: string
  agencyNameEn: string | null | undefined
  agencyNameFr: string | null | undefined
  programNameEn: string | null | undefined
  programNameFr: string | null | undefined
  agreementNumber: string
}

const normalizedValues = (values: Array<string | null | undefined>): string[] =>
  values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeFundingAgreementNumber)

const namesOverlap = (
  proposedNames: Array<string | null | undefined>,
  candidateNames: Array<string | null | undefined>
): boolean => {
  const proposedKeys = new Set(normalizedValues(proposedNames))
  return normalizedValues(candidateNames).some(candidateKey => proposedKeys.has(candidateKey))
}

const hasSameIdentityScope = (
  input: FundingHistoryIdentityInput,
  candidate: FundingAgreementCandidate
): boolean => {
  return namesOverlap(
    [input.egcs_ar_agencyname_en, input.egcs_ar_agencyname_fr],
    [candidate.agencyNameEn, candidate.agencyNameFr]
  ) && namesOverlap(
    [input.egcs_ar_programname_en, input.egcs_ar_programname_fr],
    [candidate.programNameEn, candidate.programNameFr]
  )
}

const canReadFundingAgreementCandidate = async (
  context: AuthContext,
  candidate: FundingAgreementCandidate,
  db: Kysely<Database>
): Promise<boolean> => {
  if (candidate.source === 'system') {
    const agreement = await db
      .selectFrom('Funding_Case_Agreement_Profile')
      .innerJoin(
        'Transfer_Payment_Stream',
        'Transfer_Payment_Stream.id',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
      )
      .innerJoin(
        'Transfer_Payment_Profile',
        'Transfer_Payment_Profile.id',
        'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
      )
      .where('Funding_Case_Agreement_Profile.id', '=', candidate.candidateId)
      .where('Funding_Case_Agreement_Profile._deleted', '=', false)
      .select([
        'Funding_Case_Agreement_Profile.id as agreementId',
        'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream as streamId',
        'Transfer_Payment_Profile.id as programId',
        'Transfer_Payment_Profile.egcs_tp_agency as agencyId'
      ])
      .executeTakeFirst()
    if (!agreement) return false
    return await canAccessAgreement(context, 'read', buildAgreementScope(
      String(agreement.agencyId),
      String(agreement.programId),
      String(agreement.streamId),
      String(agreement.agreementId)
    ), db)
  }

  const recipients = await db
    .selectFrom('Applicant_Recipient_Funding_History')
    .innerJoin(
      'Applicant_Recipient_Funding_History_Recipient',
      'Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory',
      'Applicant_Recipient_Funding_History.id'
    )
    .where('Applicant_Recipient_Funding_History.id', '=', candidate.candidateId)
    .where('Applicant_Recipient_Funding_History._deleted', '=', false)
    .where('Applicant_Recipient_Funding_History_Recipient._deleted', '=', false)
    .select('Applicant_Recipient_Funding_History_Recipient.egcs_ar_applicantrecipient as recipientId')
    .execute()
  return recipients.length > 0 && await canAccessApplicantRecipientIds(
    context,
    recipients.map(recipient => String(recipient.recipientId)),
    'read',
    db
  )
}

const listFundingAgreementCandidates = async (
  db: Kysely<Database>,
  includeSystemAgreements: boolean
): Promise<FundingAgreementCandidate[]> => {
  const [externalRecords, systemRecords] = await Promise.all([
    db
      .selectFrom('Applicant_Recipient_Funding_History')
      .where('_deleted', '=', false)
      .select([
        'id',
        'egcs_ar_agencyname_en',
        'egcs_ar_agencyname_fr',
        'egcs_ar_programname_en',
        'egcs_ar_programname_fr',
        'egcs_ar_agreementnumber'
      ])
      .execute(),
    includeSystemAgreements
      ? db
          .selectFrom('Funding_Case_Agreement_Profile')
          .innerJoin(
            'Transfer_Payment_Stream',
            'Transfer_Payment_Stream.id',
            'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream'
          )
          .innerJoin(
            'Transfer_Payment_Profile',
            'Transfer_Payment_Profile.id',
            'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile'
          )
          .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Transfer_Payment_Profile.egcs_tp_agency')
          .where('Funding_Case_Agreement_Profile._deleted', '=', false)
          .where('Transfer_Payment_Stream._deleted', '=', false)
          .where('Transfer_Payment_Profile._deleted', '=', false)
          .where('Agency_Profile._deleted', '=', false)
          .select([
            'Funding_Case_Agreement_Profile.id as id',
            'Agency_Profile.egcs_ay_name_en as agencyNameEn',
            'Agency_Profile.egcs_ay_name_fr as agencyNameFr',
            'Transfer_Payment_Profile.egcs_tp_name_en as programNameEn',
            'Transfer_Payment_Profile.egcs_tp_name_fr as programNameFr',
            'Funding_Case_Agreement_Profile.egcs_fc_agreementnumber as agreementNumber'
          ])
          .execute()
      : []
  ])

  return [
    ...externalRecords.map(record => ({
      source: 'external' as const,
      candidateId: String(record.id),
      agencyNameEn: record.egcs_ar_agencyname_en,
      agencyNameFr: record.egcs_ar_agencyname_fr,
      programNameEn: record.egcs_ar_programname_en,
      programNameFr: record.egcs_ar_programname_fr,
      agreementNumber: record.egcs_ar_agreementnumber
    })),
    ...systemRecords.map(record => ({
      source: 'system' as const,
      candidateId: String(record.id),
      agencyNameEn: record.agencyNameEn,
      agencyNameFr: record.agencyNameFr,
      programNameEn: record.programNameEn,
      programNameFr: record.programNameFr,
      agreementNumber: record.agreementNumber
    }))
  ]
}

export const collectFundingHistorySimilarityWarnings = async (
  context: AuthContext,
  input: FundingHistoryIdentityInput,
  db: Kysely<Database>,
  options: FundingHistorySimilarityOptions = {}
): Promise<FundingHistorySimilarityWarning[]> => {
  const proposedSource = options.proposedSource === 'system' ? 'system' : 'external'
  const [agencies, programs, agreementCandidates] = await Promise.all([
    db
      .selectFrom('Agency_Profile')
      .where('_deleted', '=', false)
      .select(['id', 'egcs_ay_name_en as nameEn', 'egcs_ay_name_fr as nameFr'])
      .execute(),
    db
      .selectFrom('Transfer_Payment_Profile')
      .where('_deleted', '=', false)
      .select(['id', 'egcs_tp_name_en as nameEn', 'egcs_tp_name_fr as nameFr'])
      .execute(),
    // Both externally entered history and system Agreements must be compared.
    // Excluding system rows here made Agreement-to-Agreement near duplicates
    // bypass the confirmation preview and transaction guard entirely.
    listFundingAgreementCandidates(db, true)
  ])

  const warnings: FundingHistorySimilarityWarning[] = []
  if (proposedSource === 'external') {
    const agencyCandidates = findFundingHistoryNameCandidates(
      [input.egcs_ar_agencyname_en, input.egcs_ar_agencyname_fr],
      agencies
    )
    for (const candidate of agencyCandidates) {
      const proposed = input.egcs_ar_agencyname_en || input.egcs_ar_agencyname_fr || ''
      const candidateValue = candidate.nameEn || candidate.nameFr || ''
      warnings.push({
        kind: 'agency',
        fingerprint: createFundingHistoryWarningFingerprint('agency', candidate.id, proposed, candidateValue),
        restricted: false,
        candidateId: candidate.id,
        labelEn: candidate.nameEn || undefined,
        labelFr: candidate.nameFr || undefined,
        agencyNameEn: candidate.nameEn,
        agencyNameFr: candidate.nameFr
      })
    }
    const programCandidates = findFundingHistoryNameCandidates(
      [input.egcs_ar_programname_en, input.egcs_ar_programname_fr],
      programs
    )
    for (const candidate of programCandidates) {
      const proposed = input.egcs_ar_programname_en || input.egcs_ar_programname_fr || ''
      const candidateValue = candidate.nameEn || candidate.nameFr || ''
      warnings.push({
        kind: 'program',
        fingerprint: createFundingHistoryWarningFingerprint('program', candidate.id, proposed, candidateValue),
        restricted: false,
        candidateId: candidate.id,
        labelEn: candidate.nameEn || undefined,
        labelFr: candidate.nameFr || undefined,
        programNameEn: candidate.nameEn,
        programNameFr: candidate.nameFr
      })
    }
  }

  for (const candidate of input.egcs_ar_agreementnumber ? agreementCandidates : []) {
    if (
      (candidate.source === 'external' && candidate.candidateId === options.excludeHistoryId)
      || (candidate.source === 'system' && candidate.candidateId === options.excludeAgreementId)
      || !hasSameIdentityScope(input, candidate)
    ) continue
    const isExactNumber = normalizeFundingAgreementNumber(input.egcs_ar_agreementnumber!)
      === normalizeFundingAgreementNumber(candidate.agreementNumber)
    if (!isExactNumber && !isNearFundingAgreementNumber(input.egcs_ar_agreementnumber!, candidate.agreementNumber)) continue
    if (isExactNumber && proposedSource === 'external') continue
    const readable = await canReadFundingAgreementCandidate(context, candidate, db)
    warnings.push({
      kind: 'agreement_number',
      fingerprint: createFundingHistoryWarningFingerprint(
        'agreement_number',
        `${candidate.source}:${candidate.candidateId}`,
        input.egcs_ar_agreementnumber!,
        candidate.agreementNumber
      ),
      restricted: !readable,
      ...(readable
        ? {
            candidateId: candidate.candidateId,
            labelEn: candidate.agreementNumber,
            labelFr: candidate.agreementNumber,
            agreementNumber: candidate.agreementNumber
          }
        : {})
    })
  }
  return warnings
}

export const assertNoExactFundingHistoryConflicts = async (
  event: H3Event,
  input: FundingHistoryIdentityInput,
  db: Kysely<Database> | Transaction<Database>,
  excludeHistoryId?: string
): Promise<void> => {
  if (!input.egcs_ar_agreementnumber) return
  const candidates = await listFundingAgreementCandidates(db, true)
  if (candidates.some(candidate =>
    (candidate.source !== 'external' || candidate.candidateId !== excludeHistoryId)
    && hasSameIdentityScope(input, candidate)
    && normalizeFundingAgreementNumber(candidate.agreementNumber)
    === normalizeFundingAgreementNumber(input.egcs_ar_agreementnumber!))) {
    return await badRequest(event, 'FUNDING_HISTORY_DUPLICATE_AGREEMENT_NUMBER', 'apiErrors.funding_history.duplicate_agreement_number')
  }
}

export const requireFundingHistorySimilarityConfirmation = async (
  event: H3Event,
  warnings: FundingHistorySimilarityWarning[],
  confirmations: string[]
): Promise<void> => {
  const unconfirmedWarnings = getUnconfirmedFundingHistoryWarnings(warnings, confirmations)
  if (unconfirmedWarnings.length === 0) return
  await throwApiError(event, {
    statusCode: 409,
    code: 'FUNDING_HISTORY_SIMILARITY_CONFIRMATION_REQUIRED',
    key: 'apiErrors.funding_history.similarity_confirmation_required',
    warnings: unconfirmedWarnings,
    details: unconfirmedWarnings.map(warning => ({
      path: warning.kind,
      code: warning.fingerprint,
      message: JSON.stringify(warning)
    }))
  })
}

export const assertFundingHistoryExistsForRecipient = async (
  event: H3Event,
  historyId: string,
  applicantRecipientId: string,
  db: Kysely<Database> | Transaction<Database>,
  lock = false
) => {
  let query = db
    .selectFrom('Applicant_Recipient_Funding_History')
    .innerJoin(
      'Applicant_Recipient_Funding_History_Recipient',
      'Applicant_Recipient_Funding_History_Recipient.egcs_ar_fundinghistory',
      'Applicant_Recipient_Funding_History.id'
    )
    .where('Applicant_Recipient_Funding_History.id', '=', historyId)
    .where('Applicant_Recipient_Funding_History._deleted', '=', false)
    .where('Applicant_Recipient_Funding_History_Recipient.egcs_ar_applicantrecipient', '=', applicantRecipientId)
    .where('Applicant_Recipient_Funding_History_Recipient._deleted', '=', false)
    .select('Applicant_Recipient_Funding_History.id as id')
  if (lock) query = query.forUpdate()
  const history = await query.executeTakeFirst()
  if (!history) {
    return await notFound(event, 'FUNDING_HISTORY_NOT_FOUND', 'apiErrors.funding_history.not_found')
  }
  return history
}

export const listFundingHistoryRecipientIds = async (
  historyId: string,
  db: Kysely<Database> | Transaction<Database>
): Promise<string[]> => {
  const recipients = await db
    .selectFrom('Applicant_Recipient_Funding_History_Recipient')
    .where('egcs_ar_fundinghistory', '=', historyId)
    .where('_deleted', '=', false)
    .select('egcs_ar_applicantrecipient')
    .orderBy('egcs_ar_applicantrecipient', 'asc')
    .execute()
  return recipients.map(recipient => String(recipient.egcs_ar_applicantrecipient))
}

export const assertFundingHistoryRecipientAccess = async (
  event: H3Event,
  context: AuthContext,
  recipientIds: string[],
  action: 'create' | 'read' | 'update' | 'delete',
  db: Kysely<Database> | Transaction<Database>
): Promise<void> => {
  if (await canAccessApplicantRecipientIds(context, recipientIds, action, db)) return
  await badRequest(event, 'INVALID_FUNDING_HISTORY_RECIPIENT', 'apiErrors.funding_history.invalid_recipient')
}
