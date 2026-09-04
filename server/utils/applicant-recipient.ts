/* eslint-disable jsdoc/require-jsdoc -- Applicant-recipient CRUD helpers are covered by route and integration tests. */
import type { GcsExtensionAgreementAccess } from '@gcs-ssc/extensions/server'
import { runBoundedExtensionOperation } from './extension-admission'
import { canonicalizeAuthorizationLockIds } from '@gcs-ssc/authorization/server'
import type { H3Event } from 'h3'
import { readBody } from 'h3'
import type { Kysely, Transaction, Updateable } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { parseI18n, readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  authorizeFreshAssignedItem,
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import { executeFreshAuthorizedApplicantRecipientWrite } from '~~/server/utils/applicant-recipient-auth'
import { lockRegisteredExtensionScopes } from '~~/server/utils/extensions'
import { listVisibleAgreementOptions } from '~~/server/utils/agreement'
import {
  APPLICANT_RECIPIENT_CHILD_ERROR_KEYS,
  assertApplicantRecipientChildExists
} from '~~/server/utils/applicant-recipient-child-resources'
import { throwIfApplicantRecipientUniqueConstraintError } from '~~/server/utils/applicant-recipient-unique-constraint-errors'
import {
  ApplicantRecipientAgencyFinancialIdPatchSchema,
  ApplicantRecipientProfileBilingualSchema,
  ApplicantRecipientProfilePatchSchema
} from '~~/shared/types/schemas'
import type {
  ApplicantRecipientAgencyFinancialIdPatch,
  ApplicantRecipientProfile,
  ApplicantRecipientProfilePatch
} from '~~/shared/types/schemas'
import type { ApplicantRecipientProfileTable, Database } from '~~/shared/types/database'

export type ApplicantRecipientCreateInput = ApplicantRecipientProfile
export type ApplicantRecipientPatchInput = ApplicantRecipientProfilePatch

const hasOwn = <T extends object>(value: T, key: keyof T) => Object.prototype.hasOwnProperty.call(value, key)
const nullableValue = <T>(value: T | undefined) => value === undefined || value === '' ? null : value
const hasKey = <TKey extends string>(
  value: unknown,
  key: TKey
): value is Record<TKey, unknown> => value !== null && typeof value === 'object' && key in value

type ApplicantRecipientWriteValues = Partial<Updateable<ApplicantRecipientProfileTable>>

type ApplicantRecipientPayload = ApplicantRecipientCreateInput | ApplicantRecipientPatchInput

const nullableApplicantRecipientFields = [
  'egcs_ar_description_en',
  'egcs_ar_description_fr',
  'egcs_ar_operatingname_en',
  'egcs_ar_operatingname_fr',
  'egcs_ar_leadagency',
  'egcs_ar_legalname_en',
  'egcs_ar_legalname_fr',
  'egcs_ar_researchorganization_en',
  'egcs_ar_researchorganization_fr'
] as const

const definedApplicantRecipientFields = [
  'egcs_ar_applicantrecipientsubtypes',
  'egcs_ar_active'
] as const

type NullableApplicantRecipientField = typeof nullableApplicantRecipientFields[number]
type DefinedApplicantRecipientField = typeof definedApplicantRecipientFields[number]

const setNullableApplicantRecipientField = (
  values: ApplicantRecipientWriteValues,
  payload: ApplicantRecipientPayload,
  field: NullableApplicantRecipientField
) => {
  if (hasOwn(payload, field)) {
    ;(values as Record<NullableApplicantRecipientField, unknown>)[field] = nullableValue(payload[field])
  }
}

const setDefinedApplicantRecipientField = (
  values: ApplicantRecipientWriteValues,
  payload: ApplicantRecipientPayload,
  field: DefinedApplicantRecipientField
) => {
  if (hasOwn(payload, field) && payload[field] !== undefined) {
    ;(values as Record<DefinedApplicantRecipientField, unknown>)[field] = payload[field]
  }
}

/**
 * Verifies applicant recipient foreign key references when they are present in the payload.
 *
 * @param db - Database instance.
 * @param payload - Create or patch payload.
 * @param options - Availability exceptions for preserving an existing reference.
 * @param options.allowInactiveLeadAgencyId - Existing inactive Agency ID that may remain selected.
 * @returns Presence flags for subtype and lead agency.
 */
export const validateApplicantRecipientReferences = async (
  db: Kysely<Database>,
  payload: ApplicantRecipientCreateInput | ApplicantRecipientPatchInput,
  options: { allowInactiveLeadAgencyId?: string } = {}
) => {
  const subtypePromise = hasOwn(payload, 'egcs_ar_applicantrecipientsubtypes') && payload.egcs_ar_applicantrecipientsubtypes
    ? db
        .selectFrom('Agency_Applicant_Recipient_Subtype')
        .where('id', '=', String(payload.egcs_ar_applicantrecipientsubtypes))
        .where('_deleted', '=', false)
        .select(['id', 'egcs_ay_organizationagency'])
        .executeTakeFirst()
    : Promise.resolve(undefined)

  const leadAgencyPromise = hasOwn(payload, 'egcs_ar_leadagency') && payload.egcs_ar_leadagency
    ? db
        .selectFrom('Agency_Profile')
        .where('id', '=', String(payload.egcs_ar_leadagency))
        .where('_deleted', '=', false)
        .where(eb => options.allowInactiveLeadAgencyId
          ? eb.or([
              eb('egcs_ay_active', '=', true),
              eb('id', '=', options.allowInactiveLeadAgencyId)
            ])
          : eb('egcs_ay_active', '=', true))
        .select('id')
        .executeTakeFirst()
    : Promise.resolve(undefined)

  const [subtype, leadAgency] = await Promise.all([subtypePromise, leadAgencyPromise])

  const subtypeMatchesLeadAgency = hasOwn(payload, 'egcs_ar_applicantrecipientsubtypes') && payload.egcs_ar_applicantrecipientsubtypes
    ? hasOwn(payload, 'egcs_ar_leadagency') && payload.egcs_ar_leadagency
      ? String(subtype?.egcs_ay_organizationagency ?? '') === String(payload.egcs_ar_leadagency)
      : true
    : true

  return {
    subtypeExists: hasOwn(payload, 'egcs_ar_applicantrecipientsubtypes') && payload.egcs_ar_applicantrecipientsubtypes
      ? !!subtype
      : true,
    subtypeMatchesLeadAgency,
    leadAgencyExists: hasOwn(payload, 'egcs_ar_leadagency') && payload.egcs_ar_leadagency ? !!leadAgency : true
  }
}

/**
 * Maps validated applicant recipient payload values into nullable DB write values.
 *
 * @param payload - Create or patch payload.
 * @returns DB-safe column values.
 */
export const mapApplicantRecipientWriteValues = (
  payload: ApplicantRecipientPayload
): ApplicantRecipientWriteValues => {
  const values: ApplicantRecipientWriteValues = {}

  nullableApplicantRecipientFields.forEach(field => setNullableApplicantRecipientField(values, payload, field))
  definedApplicantRecipientFields.forEach(field => setDefinedApplicantRecipientField(values, payload, field))

  return values
}

/**
 * Checks whether another active Proponent or Agreement link references a common address.
 *
 * @param db - Database connection used to inspect active address links.
 * @param commonAddressId - Common address identifier to inspect.
 * @param excludedApplicantRecipientAddressId - Proponent address link omitted from the check, if any.
 * @returns Whether another active address link references the common address.
 */
export const hasOtherActiveCommonAddressReferences = async (
  db: Kysely<Database>,
  commonAddressId: string,
  excludedApplicantRecipientAddressId: string | null
): Promise<boolean> => {
  let applicantRecipientAddressQuery = db
    .selectFrom('Applicant_Recipient_Address')
    .where('egcs_ar_address', '=', commonAddressId)
    .where('_deleted', '=', false)

  if (excludedApplicantRecipientAddressId !== null) {
    applicantRecipientAddressQuery = applicantRecipientAddressQuery
      .where('id', '!=', excludedApplicantRecipientAddressId)
  }

  const applicantRecipientAddress = await applicantRecipientAddressQuery
    .select('id')
    .executeTakeFirst()
  if (applicantRecipientAddress) {
    return true
  }

  const agreementAddress = await db
    .selectFrom('Funding_Case_Agreement_Address')
    .where('egcs_fc_address', '=', commonAddressId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  return Boolean(agreementAddress)
}

/**
 * Checks whether another active Proponent, completion, or approval-step link references a common contact.
 *
 * Callers must lock the active Common_Contact row before invoking this check so a concurrent
 * foreign-key reference cannot race the ownership decision.
 *
 * @param db - Database connection used to inspect active contact links.
 * @param commonContactId - Common contact identifier to inspect.
 * @param excludedApplicantRecipientContactId - Proponent contact link omitted from the check, if any.
 * @returns Whether another active link references the common contact.
 */
export const hasOtherActiveCommonContactReferences = async (
  db: Kysely<Database>,
  commonContactId: string,
  excludedApplicantRecipientContactId: string | null
): Promise<boolean> => {
  let applicantRecipientContactQuery = db
    .selectFrom('Applicant_Recipient_Contact')
    .where('egcs_ar_contact', '=', commonContactId)
    .where('_deleted', '=', false)

  if (excludedApplicantRecipientContactId !== null) {
    applicantRecipientContactQuery = applicantRecipientContactQuery
      .where('id', '!=', excludedApplicantRecipientContactId)
  }

  const applicantRecipientContact = await applicantRecipientContactQuery
    .select('id')
    .executeTakeFirst()
  if (applicantRecipientContact) return true

  const completion = await db
    .selectFrom('Common_Completion')
    .where('egcs_cn_user', '=', commonContactId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()
  if (completion) return true

  const approvalStep = await db
    .selectFrom('Common_Approval_Step')
    .where('egcs_cn_defaultuser', '=', commonContactId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  return Boolean(approvalStep)
}

const readAgencyFinancialIdPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readValidatedBodyI18n?: typeof readValidatedBodyI18n
  }).readValidatedBodyI18n ?? readValidatedBodyI18n

  return await bodyReader(event, ApplicantRecipientAgencyFinancialIdPatchSchema)
}

const assertAgencyFinancialIdForApplicantRecipient = async (
  event: H3Event,
  db: Kysely<Database>,
  applicantRecipientId: string,
  childId: string
) => await assertApplicantRecipientChildExists(
  event,
  db
    .selectFrom('Applicant_Recipient_Agency_Financial_Id')
    .where('id', '=', childId)
    .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
    .where('_deleted', '=', false)
    .select(['id', 'egcs_ar_agency', 'egcs_ar_financialsystemid'])
    .executeTakeFirst(),
  ...APPLICANT_RECIPIENT_CHILD_ERROR_KEYS.agencyFinancialIdNotFound
)

const validateAgencyFinancialIdAgency = async (
  event: H3Event,
  db: Kysely<Database>,
  agencyId: string,
  allowInactiveAgencyId?: string
) => {
  const agency = await db
    .selectFrom('Agency_Profile')
    .where('id', '=', agencyId)
    .where('_deleted', '=', false)
    .where(eb => allowInactiveAgencyId
      ? eb.or([
          eb('egcs_ay_active', '=', true),
          eb('id', '=', allowInactiveAgencyId)
        ])
      : eb('egcs_ay_active', '=', true))
    .select('id')
    .executeTakeFirst()

  if (!agency) {
    return await badRequest(
      event,
      'INVALID_APPLICANT_RECIPIENT_AGENCY_FINANCIAL_ID_AGENCY',
      'apiErrors.applicant_recipient.invalid_agency_financial_id_agency'
    )
  }

  return agency
}

const validateAgencyFinancialIdPatchReferences = async (
  event: H3Event,
  db: Kysely<Database>,
  existing: Record<'egcs_ar_agency', unknown>,
  validated: ApplicantRecipientAgencyFinancialIdPatch
) => {
  const nextAgencyId = hasOwn(validated, 'egcs_ar_agency')
    ? (validated.egcs_ar_agency ?? null)
    : (existing.egcs_ar_agency ?? null)

  if (!nextAgencyId) {
    return null
  }

  const existingAgencyId = existing.egcs_ar_agency ? String(existing.egcs_ar_agency) : undefined
  const agency = await validateAgencyFinancialIdAgency(
    event,
    db,
    String(nextAgencyId),
    String(nextAgencyId) === existingAgencyId ? existingAgencyId : undefined
  )
  if (!hasKey(agency, 'id')) {
    return agency
  }

  return null
}

const mapAgencyFinancialIdPatchValues = (
  validated: ApplicantRecipientAgencyFinancialIdPatch
) => ({
  ...(hasOwn(validated, 'egcs_ar_agency') ? { egcs_ar_agency: validated.egcs_ar_agency ?? null } : {}),
  ...(hasOwn(validated, 'egcs_ar_financialsystemid') ? { egcs_ar_financialsystemid: validated.egcs_ar_financialsystemid } : {})
})

export const patchApplicantRecipientAgencyFinancialId = async (
  event: H3Event,
  db: Kysely<Database>,
  applicantRecipientId: string,
  childId: string
) => {
  const validated = await readAgencyFinancialIdPatchBody(event)
  const values = mapAgencyFinancialIdPatchValues(validated)

  try {
    return await executeFreshAuthorizedApplicantRecipientWrite(
      event,
      db,
      applicantRecipientId,
      'update',
      async trx => {
        const existing = await assertAgencyFinancialIdForApplicantRecipient(
          event,
          trx,
          applicantRecipientId,
          childId
        )
        if (!hasKey(existing, 'id') || !hasKey(existing, 'egcs_ar_agency')) {
          return existing
        }

        const referenceError = await validateAgencyFinancialIdPatchReferences(event, trx, existing, validated)
        if (referenceError) {
          return referenceError
        }
        if (Object.keys(values).length === 0) {
          return existing
        }

        return await trx
          .updateTable('Applicant_Recipient_Agency_Financial_Id')
          .set(values)
          .where('id', '=', childId)
          .where('egcs_ar_applicantrecipient', '=', applicantRecipientId)
          .where('_deleted', '=', false)
          .returning(['id', 'egcs_ar_agency', 'egcs_ar_financialsystemid'])
          .executeTakeFirstOrThrow()
      }
    )
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
}

const readApplicantRecipientPatchBody = async (event: H3Event) => {
  const bodyReader = (globalThis as typeof globalThis & {
    readBody?: typeof readBody
  }).readBody ?? readBody
  const rawBody = await bodyReader<Record<string, unknown>>(event) as Record<string, unknown>
  const validated = await parseI18n(event, ApplicantRecipientProfilePatchSchema, rawBody)

  return { rawBody, validated }
}

const getApplicantRecipientProfileForPatch = async (
  event: H3Event,
  db: Kysely<Database>,
  id: string,
  lock = false
) => {
  let query = db
    .selectFrom('Applicant_Recipient_Profile')
    .where('id', '=', id)
    .where('_deleted', '=', false)
    .select([
      'id',
      'egcs_ar_leadagency',
      'egcs_ar_description_en',
      'egcs_ar_description_fr',
      'egcs_ar_operatingname_en',
      'egcs_ar_operatingname_fr',
      'egcs_ar_legalname_en',
      'egcs_ar_legalname_fr'
    ])
  if (lock) query = query.forUpdate()
  const existing = await query.executeTakeFirst()

  if (!existing) {
    return await notFound(event, 'APPLICANT_RECIPIENT_PROFILE_NOT_FOUND', 'apiErrors.applicant_recipient.profile_not_found')
  }

  return existing
}

const validateApplicantRecipientPatchReferences = async (
  event: H3Event,
  db: Kysely<Database>,
  existingLeadAgency: string | null | undefined,
  validated: ApplicantRecipientProfilePatch
) => {
  const referencePayload: ApplicantRecipientPatchInput = {
    ...validated,
    ...(hasOwn(validated, 'egcs_ar_leadagency') ? {} : { egcs_ar_leadagency: existingLeadAgency ?? undefined })
  }
  const nextLeadAgencyId = referencePayload.egcs_ar_leadagency
    ? String(referencePayload.egcs_ar_leadagency)
    : undefined
  const currentLeadAgencyId = existingLeadAgency ? String(existingLeadAgency) : undefined
  const references = await validateApplicantRecipientReferences(db, referencePayload, {
    allowInactiveLeadAgencyId: nextLeadAgencyId === currentLeadAgencyId ? currentLeadAgencyId : undefined
  })
  if (!references.subtypeExists) {
    return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_SUBTYPE', 'apiErrors.applicant_recipient.invalid_subtype')
  }
  if (!references.leadAgencyExists) {
    return await badRequest(event, 'INVALID_APPLICANT_RECIPIENT_LEAD_AGENCY', 'apiErrors.applicant_recipient.invalid_lead_agency')
  }
  if (!references.subtypeMatchesLeadAgency) {
    return await badRequest(
      event,
      'INVALID_APPLICANT_RECIPIENT_SUBTYPE_FOR_LEAD_AGENCY',
      'apiErrors.applicant_recipient.invalid_subtype_for_lead_agency'
    )
  }

  return null
}

const lockApplicantRecipientLeadAgencies = async (
  event: H3Event,
  db: Kysely<Database>,
  currentAgencyId: string,
  destinationAgencyId: string
) => {
  const agencyIds = canonicalizeAuthorizationLockIds([currentAgencyId, destinationAgencyId])
  const agencies = await db
    .selectFrom('Agency_Profile')
    .where('id', 'in', agencyIds)
    .select(['id', 'egcs_ay_active', '_deleted'])
    .orderBy('id', 'asc')
    .forUpdate()
    .execute()
  const destination = agencies.find(agency => String(agency.id) === destinationAgencyId)
  if (!destination || destination._deleted || !destination.egcs_ay_active) {
    return await badRequest(
      event,
      'INVALID_APPLICANT_RECIPIENT_LEAD_AGENCY',
      'apiErrors.applicant_recipient.invalid_lead_agency'
    )
  }
  return null
}

const emitApplicantRecipientProfileUpdated = async (
  event: H3Event,
  db: Transaction<Database>,
  applicantRecipientId: string,
  agencyId: string,
  rawBody: Record<string, unknown>,
  validatedBody: ApplicantRecipientProfilePatch,
  updatedProfile: Record<string, unknown>
) => {
  await runBoundedExtensionOperation('applicantrecipient:profile:updated', async signal =>
    await useNitroApp().hooks.callHook('applicantrecipient:profile:updated', {
      signal,
      event,
      db,
      agreementAccess: {
        listVisibleOptions: async (rawDb, input) => {
          const agreementDb = rawDb as Kysely<Database>
          const context = await requireFreshAuthContext(event, agreementDb)
          return await listVisibleAgreementOptions(context, input.action, input.streamId, agreementDb)
        }
      } satisfies GcsExtensionAgreementAccess,
      applicantRecipientId,
      agencyId,
      rawBody,
      validatedBody,
      updatedProfile
    }))
}

type ApplicantRecipientExtensionScope = { agencyId: string; streamIds: string[] }

class ApplicantRecipientExtensionScopeChanged extends Error {
  constructor(readonly scopes: ApplicantRecipientExtensionScope[]) {
    super('Applicant-recipient extension scopes changed while acquiring lifecycle locks.')
  }
}

const resolveApplicantRecipientExtensionScopes = async (
  db: Kysely<Database>,
  applicantRecipientId: string,
  leadAgencyId: string
): Promise<ApplicantRecipientExtensionScope[]> => {
  const rows = await db
    .selectFrom('Funding_Case_Agreement_Applicant_Recipient')
    .innerJoin(
      'Funding_Case_Agreement_Profile',
      'Funding_Case_Agreement_Profile.id',
      'Funding_Case_Agreement_Applicant_Recipient.egcs_fc_fundingagreement'
    )
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
    .where('Funding_Case_Agreement_Applicant_Recipient.egcs_fc_applicantrecipient', '=', applicantRecipientId)
    .where('Funding_Case_Agreement_Applicant_Recipient._deleted', '=', false)
    .where('Funding_Case_Agreement_Profile._deleted', '=', false)
    .where('Transfer_Payment_Stream._deleted', '=', false)
    .where('Transfer_Payment_Profile._deleted', '=', false)
    .select([
      'Transfer_Payment_Profile.egcs_tp_agency as agency_id',
      'Transfer_Payment_Stream.id as stream_id'
    ])
    .execute()
  const streamsByAgency = new Map<string, Set<string>>([[leadAgencyId, new Set()]])
  for (const row of rows) {
    const agencyId = String(row.agency_id)
    const streamIds = streamsByAgency.get(agencyId) ?? new Set<string>()
    streamIds.add(String(row.stream_id))
    streamsByAgency.set(agencyId, streamIds)
  }
  return [...streamsByAgency.entries()]
    .map(([agencyId, streamIds]) => ({ agencyId, streamIds: [...streamIds].sort() }))
    .sort((left, right) => left.agencyId.localeCompare(right.agencyId, 'en', { numeric: true }))
}

const extensionScopesMatch = (
  left: ApplicantRecipientExtensionScope[],
  right: ApplicantRecipientExtensionScope[]
): boolean => JSON.stringify(left) === JSON.stringify(right)

export const patchApplicantRecipientProfile = async (
  event: H3Event,
  db: Kysely<Database>,
  id: string
) => {
  const { rawBody, validated } = await readApplicantRecipientPatchBody(event)
  const mapped = mapApplicantRecipientWriteValues(validated)

  try {
    const initial = await getApplicantRecipientProfileForPatch(event, db, id)
    if (!hasKey(initial, 'id')) return initial
    const initialAgencyId = String(initial.egcs_ar_leadagency ?? '')
    const requestedAgencyId = hasOwn(validated, 'egcs_ar_leadagency') && validated.egcs_ar_leadagency
      ? String(validated.egcs_ar_leadagency)
      : initialAgencyId
    let plannedScopes = await resolveApplicantRecipientExtensionScopes(db, id, requestedAgencyId)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await db.transaction().execute(async trx => {
          const context = await requireFreshAuthContext(event, trx)
          await lockRegisteredExtensionScopes(trx, plannedScopes)
          const existing = await getApplicantRecipientProfileForPatch(event, trx, id, true)
          if (!hasKey(existing, 'id')) return existing

          const currentAgencyId = String(existing.egcs_ar_leadagency ?? '')
          const destinationAgencyId = hasOwn(validated, 'egcs_ar_leadagency') && validated.egcs_ar_leadagency
            ? String(validated.egcs_ar_leadagency)
            : currentAgencyId
          const currentScopes = await resolveApplicantRecipientExtensionScopes(trx, id, destinationAgencyId)
          if (!extensionScopesMatch(plannedScopes, currentScopes)) {
            throw new ApplicantRecipientExtensionScopeChanged(currentScopes)
          }
          if (destinationAgencyId !== currentAgencyId) {
            const leadAgencyError = await lockApplicantRecipientLeadAgencies(
              event,
              trx,
              currentAgencyId,
              destinationAgencyId
            )
            if (leadAgencyError) return leadAgencyError
          }

          await authorizeFreshAssignedItem(event, trx, context, 'applicantrecipient', id, 'update')
          if (destinationAgencyId !== currentAgencyId) {
            await authorizeWithFreshAuthContext(
              event,
              context,
              'applicant_recipient',
              'update',
              { type: 'agency', agencyId: destinationAgencyId }
            )
          }

          await parseI18n(event, ApplicantRecipientProfileBilingualSchema, {
            egcs_ar_description_en: existing.egcs_ar_description_en,
            egcs_ar_description_fr: existing.egcs_ar_description_fr,
            egcs_ar_operatingname_en: existing.egcs_ar_operatingname_en,
            egcs_ar_operatingname_fr: existing.egcs_ar_operatingname_fr,
            egcs_ar_legalname_en: existing.egcs_ar_legalname_en,
            egcs_ar_legalname_fr: existing.egcs_ar_legalname_fr,
            ...validated
          })

          const referenceError = await validateApplicantRecipientPatchReferences(
            event,
            trx,
            existing.egcs_ar_leadagency,
            validated
          )
          if (referenceError) return referenceError

          const profile = Object.keys(mapped).length === 0
            ? await trx.selectFrom('Applicant_Recipient_Profile').where('id', '=', id)
                .where('_deleted', '=', false).selectAll().executeTakeFirstOrThrow()
            : await trx.updateTable('Applicant_Recipient_Profile').set(mapped).where('id', '=', id)
                .where('_deleted', '=', false).returningAll().executeTakeFirstOrThrow()

          await emitApplicantRecipientProfileUpdated(
            event, trx, id, String(profile.egcs_ar_leadagency ?? existing.egcs_ar_leadagency ?? ''),
            rawBody, validated, profile as Record<string, unknown>
          )

          return { profile }
        })
        return hasKey(result, 'profile') ? result.profile : result
      } catch (error: unknown) {
        if (!(error instanceof ApplicantRecipientExtensionScopeChanged)) throw error
        plannedScopes = error.scopes
      }
    }
    return await badRequest(event, 'APPLICANT_RECIPIENT_PROFILE_SCOPE_CHANGED', 'apiErrors.request.invalid_status')
  } catch (error: unknown) {
    await throwIfApplicantRecipientUniqueConstraintError(event, error)
    throw error
  }
}
