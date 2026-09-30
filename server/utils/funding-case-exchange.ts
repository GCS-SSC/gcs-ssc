/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Internal exchange operations use the typed host contract below. */
import { isDeepStrictEqual } from 'node:util'
import { createError } from 'h3'
import { sql, type Kysely, type Transaction } from 'kysely'
import { z } from 'zod'
import type { Database, JsonValue } from '~~/shared/types/database'
import { PositivePostgresBigintIdSchema } from '~~/shared/types/schemas/common'
import type { AuthContext } from './authorize'
import { canAccessApplicantRecipient } from './applicant-recipient-auth'
import { BusinessStatusViolation, lockAgencyDraftStatus } from './business-status-runtime'
import { lockAssignableGroup } from './groups'
import { resolveFundingOpportunityScope } from './funding-case'
import { getFundingOpportunityStatus, isFundingOpportunityIntakeEligible } from './funding-opportunity-status'

const object = z.record(z.string(), z.json())
const sourceText = (max: number) => z.string().trim().min(1).max(max)

/** Host-owned input for the public SDK application import operation. IDs remain exact decimal strings. */
export const ExternalFundingCaseIntakeInputSchema = z.object({
  intakeId: PositivePostgresBigintIdSchema.optional(),
  opportunityId: PositivePostgresBigintIdSchema,
  applicantRecipientId: PositivePostgresBigintIdSchema,
  groupId: PositivePostgresBigintIdSchema,
  applicationId: PositivePostgresBigintIdSchema,
  application: object,
  sourceSystem: sourceText(100),
  sourceSubmissionId: sourceText(255),
  sourceExport: object
}).strict()

export type ExternalFundingCaseIntakeInput = z.input<typeof ExternalFundingCaseIntakeInputSchema>
export type ExternalFundingCaseIntakeResult =
  | { status: 'created'; intakeId: string; draftStatusId: string }
  | { status: 'already_imported'; intakeId: string }
  | { status: 'opportunity_unavailable' | 'recipient_unavailable' | 'group_unavailable' | 'intake_id_conflict' | 'source_conflict' | 'application_id_conflict' | 'draft_status_unavailable' }

const denied = (): never => {
  throw createError({ statusCode: 403, message: 'Funding case exchange is forbidden.',
    data: { code: 'FUNDING_CASE_EXCHANGE_FORBIDDEN' } })
}

/** Creates a group-queued Intake with the staff actor's current domain permissions. */
export const createExternalFundingCaseIntake = async (
  trx: Transaction<Database>, auth: AuthContext, rawInput: ExternalFundingCaseIntakeInput,
  routeScope: { agencyId?: string; streamId?: string }
): Promise<ExternalFundingCaseIntakeResult> => await createFundingCaseIntakeEvidence(
  trx, { kind: 'actor', auth }, rawInput, routeScope
)

/** Creates a group-only Intake for an enabled, explicitly authorized Agency service. */
export const createScheduledFundingCaseIntake = async (
  trx: Transaction<Database>, agencyId: string, rawInput: ExternalFundingCaseIntakeInput
): Promise<ExternalFundingCaseIntakeResult> => await createFundingCaseIntakeEvidence(
  trx, { kind: 'agency_service', agencyId }, rawInput, { agencyId }
)

/** Shares immutable evidence and lifecycle enforcement between staff and Agency service imports. */
const createFundingCaseIntakeEvidence = async (
  trx: Transaction<Database>,
  authority: { kind: 'actor'; auth: AuthContext } | { kind: 'agency_service'; agencyId: string },
  rawInput: ExternalFundingCaseIntakeInput,
  routeScope: { agencyId?: string; streamId?: string }
): Promise<ExternalFundingCaseIntakeResult> => {
  const input = ExternalFundingCaseIntakeInputSchema.parse(rawInput)
  const opportunityId = String(input.opportunityId)
  const intakeId = input.intakeId === undefined ? undefined : String(input.intakeId)
  const applicantRecipientId = String(input.applicantRecipientId)
  const groupId = String(input.groupId)
  const applicationId = String(input.applicationId)
  const scope = await resolveFundingOpportunityScope(trx, opportunityId)
  if (!scope || (routeScope.agencyId && routeScope.agencyId !== scope.agencyId)
    || (routeScope.streamId && !scope.streamIds.includes(routeScope.streamId))) {
    return { status: 'opportunity_unavailable' }
  }
  if (authority.kind === 'actor' && !authority.auth.userAbilities.authorize('funding_case', 'create', scope.scope)) denied()
  const opportunity = await trx.selectFrom('Funding_Opportunity_Profile')
    .select('egcs_fo_status')
    .select(sql<boolean>`CURRENT_DATE BETWEEN egcs_fo_datestart AND egcs_fo_dateend`.as('in_window'))
    .where('id', '=', opportunityId).where('_deleted', '=', false)
    .forUpdate().executeTakeFirst()
  if (!opportunity) return { status: 'opportunity_unavailable' }
  // Opportunity PATCH holds this row lock while changing selected Streams. Recheck
  // after acquiring it so a route Stream removed by a concurrent PATCH cannot import.
  const lockedScope = await resolveFundingOpportunityScope(trx, opportunityId)
  if (!lockedScope || (routeScope.agencyId && routeScope.agencyId !== lockedScope.agencyId)
    || (routeScope.streamId && !lockedScope.streamIds.includes(routeScope.streamId))) {
    return { status: 'opportunity_unavailable' }
  }
  if (authority.kind === 'actor' && !authority.auth.userAbilities.authorize('funding_case', 'create', lockedScope.scope)) denied()

  // Once the portal has the host ID, it is authoritative for retries. Never create
  // a new Intake in response to a stale or incorrectly paired receipt.
  if (intakeId) {
    const byId = await trx.selectFrom('Funding_Case_Intake_Profile')
      .select(['id', 'egcs_fi_applicationid', 'egcs_fi_fundingopportunity', 'egcs_fi_applicantrecipient',
        'egcs_fi_sourcesystem', 'egcs_fi_sourcesubmissionid', 'egcs_fi_sourceexport', '_deleted'])
      .where('id', '=', intakeId).forUpdate().executeTakeFirst()
    if (!byId || byId._deleted || String(byId.egcs_fi_applicationid) !== applicationId
      || String(byId.egcs_fi_fundingopportunity) !== opportunityId
      || String(byId.egcs_fi_applicantrecipient) !== applicantRecipientId
      || byId.egcs_fi_sourcesystem !== input.sourceSystem
      || byId.egcs_fi_sourcesubmissionid !== input.sourceSubmissionId
      || !isDeepStrictEqual(byId.egcs_fi_sourceexport, input.sourceExport)) {
      return { status: 'intake_id_conflict' }
    }
    return { status: 'already_imported', intakeId }
  }

  // A submission identity is global, even when two connector requests resolve it
  // to different Opportunities. Serialize the first insert and its retry check.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.sourceSystem, input.sourceSubmissionId])}::text, 0))`.execute(trx)
  const existing = await trx.selectFrom('Funding_Case_Intake_Profile')
    .select(['id', 'egcs_fi_applicationid', 'egcs_fi_fundingopportunity', 'egcs_fi_applicantrecipient',
      'egcs_fi_sourceexport', '_deleted'])
    .where('egcs_fi_sourcesystem', '=', input.sourceSystem)
    .where('egcs_fi_sourcesubmissionid', '=', input.sourceSubmissionId)
    .forUpdate().executeTakeFirst()
  if (existing) {
    if (existing._deleted || String(existing.egcs_fi_applicationid) !== applicationId
      || String(existing.egcs_fi_fundingopportunity) !== opportunityId
      || String(existing.egcs_fi_applicantrecipient) !== applicantRecipientId
      || !isDeepStrictEqual(existing.egcs_fi_sourceexport, input.sourceExport)) {
      return { status: 'source_conflict' }
    }
    return { status: 'already_imported', intakeId: String(existing.id) }
  }
  const opportunityStatus = await getFundingOpportunityStatus(trx, String(opportunity.egcs_fo_status), lockedScope.agencyId)
  if (!isFundingOpportunityIntakeEligible(opportunityStatus) || !opportunity.in_window) {
    return { status: 'opportunity_unavailable' }
  }
  const recipient = await trx.selectFrom('Applicant_Recipient_Profile').select(['id', 'egcs_ar_leadagency', 'egcs_ar_active'])
    .where('id', '=', applicantRecipientId).where('_deleted', '=', false).forShare().executeTakeFirst()
  const recipientVisible = authority.kind === 'actor'
    ? await canAccessApplicantRecipient(authority.auth, applicantRecipientId, 'read', trx)
    : Boolean(recipient?.egcs_ar_active && (String(recipient.egcs_ar_leadagency) === authority.agencyId
      || await trx.selectFrom('Funding_Case_Agreement_Applicant_Recipient as link')
        .innerJoin('Funding_Case_Agreement_Profile as agreement', 'agreement.id', 'link.egcs_fc_fundingagreement')
        .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'agreement.egcs_fc_transferpaymentstream')
        .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
        .select('link.id').where('link.egcs_fc_applicantrecipient', '=', applicantRecipientId)
        .where('program.egcs_tp_agency', '=', authority.agencyId)
        .where('link._deleted', '=', false).where('agreement._deleted', '=', false)
        .where('stream._deleted', '=', false).where('program._deleted', '=', false)
        .forShare(['link', 'agreement', 'stream', 'program']).executeTakeFirst()))
  if (!recipient || !recipientVisible) {
    return { status: 'recipient_unavailable' }
  }
  const occupied = await trx.selectFrom('Funding_Case_Intake_Profile').select('id')
    .where('egcs_fi_applicationid', '=', applicationId).where('_deleted', '=', false).executeTakeFirst()
  if (occupied) return { status: 'application_id_conflict' }
  if (!await lockAssignableGroup(trx, groupId, lockedScope.agencyId)) return { status: 'group_unavailable' }
  let draftStatusId: string
  try {
    draftStatusId = await lockAgencyDraftStatus(trx, lockedScope.agencyId)
  } catch (error: unknown) {
    if (error instanceof BusinessStatusViolation && error.code === 'BUSINESS_STATUS_NOT_FOUND') {
      return { status: 'draft_status_unavailable' }
    }
    throw error
  }
  const intake = await trx.insertInto('Funding_Case_Intake_Profile').values({
    egcs_fi_applicationid: applicationId,
    egcs_fi_application: input.application as Record<string, JsonValue>,
    egcs_fi_fundingopportunity: opportunityId,
    egcs_fi_applicantrecipient: applicantRecipientId,
    egcs_fi_status: draftStatusId,
    egcs_fi_group: groupId,
    egcs_fi_sourcesystem: input.sourceSystem,
    egcs_fi_sourcesubmissionid: input.sourceSubmissionId,
    egcs_fi_sourceexport: input.sourceExport as Record<string, JsonValue>
  }).returning('id').executeTakeFirstOrThrow()
  return { status: 'created', intakeId: String(intake.id), draftStatusId }
}

/** Reads form-agnostic host metadata for an extension-owned portal publication. */
export const projectFundingOpportunityForPortal = async (
  db: Kysely<Database>, auth: AuthContext, opportunityId: string,
  routeScope: { agencyId?: string; streamId?: string },
  options: { includeInactive?: boolean } = {}
) => {
  const scope = await resolveFundingOpportunityScope(db, opportunityId)
  if (!scope || (routeScope.agencyId && routeScope.agencyId !== scope.agencyId)
    || (routeScope.streamId && !scope.streamIds.includes(routeScope.streamId))) return null
  if (!auth.userAbilities.authorize('transfer_payment', 'update', scope.scope)) denied()
  const row = await db.selectFrom('Funding_Opportunity_Profile as opportunity')
    .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'opportunity.egcs_fo_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
    .innerJoin('Agency_Profile as agency', 'agency.id', 'program.egcs_tp_agency')
    .select([
      'opportunity.id as opportunity_id', 'opportunity.egcs_fo_name_en', 'opportunity.egcs_fo_name_fr',
      'opportunity.egcs_fo_objective_en', 'opportunity.egcs_fo_objective_fr',
      sql<string>`to_char(opportunity.egcs_fo_datestart, 'YYYY-MM-DD')`.as('start_date'),
      sql<string>`to_char(opportunity.egcs_fo_dateend, 'YYYY-MM-DD')`.as('end_date'),
      'opportunity.egcs_fo_status',
      'stream.id as stream_id', 'stream.egcs_tp_name_en as stream_name_en', 'stream.egcs_tp_name_fr as stream_name_fr',
      'program.id as program_id', 'program.egcs_tp_name_en as program_name_en', 'program.egcs_tp_name_fr as program_name_fr',
      'agency.id as agency_id', 'agency.egcs_ay_name_en as agency_name_en', 'agency.egcs_ay_name_fr as agency_name_fr'
    ])
    .where('opportunity.id', '=', opportunityId).where('opportunity._deleted', '=', false)
    .where('stream._deleted', '=', false).where('program._deleted', '=', false).where('agency._deleted', '=', false)
    .forShare().executeTakeFirst()
  if (!row) return null
  const opportunityStatus = await getFundingOpportunityStatus(db, String(row.egcs_fo_status), scope.agencyId)
  const active = isFundingOpportunityIntakeEligible(opportunityStatus)
  if (!active && !options.includeInactive) return null
  const editable = Boolean(opportunityStatus && !opportunityStatus._deleted
    && !opportunityStatus.egcs_cn_readonly && !opportunityStatus.egcs_cn_terminal)
  const streams = await db.selectFrom('Funding_Opportunity_Stream')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Opportunity_Stream.egcs_fo_transferpaymentstream')
    .select(['Transfer_Payment_Stream.id', 'Transfer_Payment_Stream.egcs_tp_name_en as name_en',
      'Transfer_Payment_Stream.egcs_tp_name_fr as name_fr'])
    .where('Funding_Opportunity_Stream.egcs_fo_fundingopportunity', '=', opportunityId)
    .where('Funding_Opportunity_Stream._deleted', '=', false).execute()
  streams.sort((a, b) => String(a.id) === scope.streamId
    ? -1
    : String(b.id) === scope.streamId
      ? 1
      : String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  const publicationStream = streams.find(stream => String(stream.id) === (routeScope.streamId ?? scope.streamId))
  if (!publicationStream) return null
  const attachmentTypes = await db.selectFrom('Funding_Opportunity_Attachment_Type as selected')
    .innerJoin('Common_Attachment_Types as type', 'type.id', 'selected.egcs_fo_attachmenttype')
    .select(['type.id', 'type.egcs_cn_name_en', 'type.egcs_cn_name_fr',
      'type.egcs_cn_description_en', 'type.egcs_cn_description_fr'])
    .where('selected.egcs_fo_fundingopportunity', '=', opportunityId)
    .where('selected.egcs_fo_isinternal', '=', false)
    .where('selected._deleted', '=', false)
    .where('type._deleted', '=', false)
    .where('type.egcs_cn_agency', '=', scope.agencyId)
    .orderBy('type.egcs_cn_name_en').execute()
  return {
    sourceSystem: 'gcs-ssc', foreignSystemId: String(row.opportunity_id),
    active, editable,
    opportunityId: String(row.opportunity_id),
    agency: { id: String(row.agency_id), nameEn: row.agency_name_en, nameFr: row.agency_name_fr },
    program: { id: String(row.program_id), nameEn: row.program_name_en, nameFr: row.program_name_fr },
    stream: { id: String(publicationStream.id), nameEn: publicationStream.name_en, nameFr: publicationStream.name_fr },
    streams: streams.map(stream => ({ id: String(stream.id), nameEn: stream.name_en, nameFr: stream.name_fr })),
    nameEn: row.egcs_fo_name_en, nameFr: row.egcs_fo_name_fr,
    objectiveEn: row.egcs_fo_objective_en, objectiveFr: row.egcs_fo_objective_fr,
    attachmentTypes: attachmentTypes.map(type => ({
      id: String(type.id), nameEn: type.egcs_cn_name_en, nameFr: type.egcs_cn_name_fr,
      descriptionEn: type.egcs_cn_description_en, descriptionFr: type.egcs_cn_description_fr
    })),
    startDate: row.start_date, startTime: '00:00:00.000000',
    endDate: row.end_date, endTime: '23:59:59.999999'
  }
}
