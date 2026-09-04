/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns -- central status lock/transition primitives */
import type { Kysely, Transaction } from 'kysely'
import type { H3Event } from 'h3'
import type { Database } from '~~/shared/types/database'
import type { CoreLifecycleEntityType } from '~~/shared/constants/entity-registry'
import type { StatusId } from '~~/shared/types/status'
import { throwApiError } from '~~/server/utils/api-errors'

type DbClient = Kysely<Database> | Transaction<Database>
export type BusinessStatusMutationMode = 'ordinary' | 'workflow' | 'engine'

export type BusinessStatusCarrier = {
  entityType: CoreLifecycleEntityType
  entityId: string
  statusId: StatusId
}

export type LockedBusinessStatus = BusinessStatusCarrier & {
  agencyId: string
  agreementId: string
  authorizationRoot: { entityType: 'fundingcaseagreement', entityId: string }
  status: {
    id: StatusId
    readOnly: boolean
    terminal: boolean
    isDraft: boolean
  }
  completed: boolean
  ancestors: Array<BusinessStatusCarrier & {
    status: { id: StatusId, readOnly: boolean, terminal: boolean, isDraft: boolean }
    completed: boolean
  }>
}

export class BusinessStatusViolation extends Error {
  constructor(
    readonly code: 'BUSINESS_STATUS_NOT_FOUND' | 'BUSINESS_STATUS_READ_ONLY' | 'BUSINESS_STATUS_TERMINAL' | 'BUSINESS_COMPLETED' | 'BUSINESS_STATUS_AGENCY_MISMATCH',
    message: string
  ) {
    super(message)
  }
}

/** Explicit ownership/lock registry for every configurable business-status carrier. */
type BusinessStatusRegistryEntry = {
  table: string
  authorizationRoot: 'self' | 'agreement'
  ancestors: readonly CoreLifecycleEntityType[]
  ordinaryLockExemptAncestors?: readonly CoreLifecycleEntityType[]
}

export const BUSINESS_STATUS_REGISTRY = {
  fundingcaseagreement: { table: 'Funding_Case_Agreement_Profile', authorizationRoot: 'self', ancestors: [] },
  fundingcaseamendment: { table: 'Funding_Case_Agreement_Amendment', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] },
  fundingcaseagreementcloseout: { table: 'Funding_Case_Agreement_Closeout', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] },
  fundingcaseagreementclaim: { table: 'Funding_Case_Agreement_Claim', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] },
  fundingclaimreconcile: {
    table: 'Funding_Case_Agreement_Claim_Reconcile',
    authorizationRoot: 'agreement',
    ancestors: ['fundingcaseagreement', 'fundingcaseagreementclaim'],
    // Claim completion is the prerequisite for starting independently assigned
    // reconciliation casework. It must not freeze that downstream record.
    ordinaryLockExemptAncestors: ['fundingcaseagreementclaim']
  },
  fundingcaseagreementcommitment: { table: 'Funding_Case_Agreement_Commitment', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] },
  fundingcasepayment: {
    table: 'Funding_Case_Agreement_Payment',
    authorizationRoot: 'agreement',
    ancestors: ['fundingcaseagreement', 'fundingcaseagreementcommitment'],
    // Commitment completion activates the authoritative commitment used by
    // downstream Payments. It must not freeze independently assigned Payment
    // casework created from that completed commitment.
    ordinaryLockExemptAncestors: ['fundingcaseagreementcommitment']
  },
  fundingcaseforecast: { table: 'Funding_Case_Agreement_Forecast', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] },
  fundingcasemonitor: { table: 'Funding_Case_Agreement_Monitor', authorizationRoot: 'agreement', ancestors: ['fundingcaseagreement'] }
} as const satisfies Record<CoreLifecycleEntityType, BusinessStatusRegistryEntry>

const businessStatusEntityTypes = new Set<string>(Object.keys(BUSINESS_STATUS_REGISTRY))
export const isBusinessStatusEntityType = (value: string): value is CoreLifecycleEntityType => businessStatusEntityTypes.has(value)

export const lockAgencyDraftStatus = async (
  trx: Transaction<Database>,
  agencyId: string
): Promise<StatusId> => {
  const draft = await trx.selectFrom('Common_Status').select('id')
    .where('egcs_cn_agency', '=', agencyId).where('egcs_cn_isdraft', '=', true)
    .where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!draft) throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Agency Draft status is unavailable')
  return String(draft.id)
}

const readCarrierStatus = async (
  db: DbClient,
  entityType: CoreLifecycleEntityType,
  entityId: string
): Promise<StatusId | null> => {
  const statusId = entityType === 'fundingcaseagreement'
    ? (await db.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
    : entityType === 'fundingcaseamendment'
      ? (await db.selectFrom('Funding_Case_Agreement_Amendment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
      : entityType === 'fundingcaseagreementcloseout'
        ? (await db.selectFrom('Funding_Case_Agreement_Closeout').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
        : entityType === 'fundingcaseagreementclaim'
          ? (await db.selectFrom('Funding_Case_Agreement_Claim').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
          : entityType === 'fundingclaimreconcile'
            ? (await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
            : entityType === 'fundingcaseagreementcommitment'
              ? (await db.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
              : entityType === 'fundingcasepayment'
                ? (await db.selectFrom('Funding_Case_Agreement_Payment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
                : entityType === 'fundingcaseforecast'
                  ? (await db.selectFrom('Funding_Case_Agreement_Forecast').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
                  : (await db.selectFrom('Funding_Case_Agreement_Monitor').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst())?.egcs_fc_status
  return statusId === undefined ? null : String(statusId)
}

export const resolveBusinessStatusId = readCarrierStatus

/** Read-side projection for edit controls; authoritative writes must still call lockBusinessStatus. */
export const resolveBusinessStatusProtection = async (
  db: DbClient,
  entityType: CoreLifecycleEntityType,
  entityId: string
) => {
  const statusId = await readCarrierStatus(db, entityType, entityId)
  if (!statusId) return null
  const status = await db.selectFrom('Common_Status').select(['egcs_cn_readonly', 'egcs_cn_terminal', 'egcs_cn_isdraft'])
    .where('id', '=', statusId).where('_deleted', '=', false).executeTakeFirst()
  const completion = await db.selectFrom('Common_Completion').select('id')
    .where('egcs_cn_entitytype', '=', entityType).where('egcs_cn_entityid', '=', entityId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!status) return null
  return {
    statusId,
    readOnly: status.egcs_cn_readonly,
    terminal: status.egcs_cn_terminal,
    isDraft: status.egcs_cn_isdraft,
    completed: Boolean(completion),
    locked: status.egcs_cn_readonly || status.egcs_cn_terminal || Boolean(completion)
  }
}

type Lineage = { agreementId: string, carriers: Array<{ entityType: CoreLifecycleEntityType, entityId: string }> }

const resolveLineage = async (
  db: DbClient,
  entityType: CoreLifecycleEntityType,
  entityId: string
): Promise<Lineage | null> => {
  if (entityType === 'fundingcaseagreement') return { agreementId: entityId, carriers: [{ entityType, entityId }] }
  if (entityType === 'fundingclaimreconcile') {
    const row = await db.selectFrom('Funding_Case_Agreement_Claim_Reconcile')
      .innerJoin('Funding_Case_Agreement_Claim', 'Funding_Case_Agreement_Claim.id', 'Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim')
      .select(['Funding_Case_Agreement_Claim_Reconcile.egcs_fc_fundingagreementclaim as claimId', 'Funding_Case_Agreement_Claim.egcs_fc_fundingagreement as agreementId'])
      .where('Funding_Case_Agreement_Claim_Reconcile.id', '=', entityId).where('Funding_Case_Agreement_Claim_Reconcile._deleted', '=', false).executeTakeFirst()
    if (!row) return null
    return { agreementId: String(row.agreementId), carriers: [
      { entityType: 'fundingcaseagreement', entityId: String(row.agreementId) },
      { entityType: 'fundingcaseagreementclaim', entityId: String(row.claimId) },
      { entityType, entityId }
    ] }
  }
  if (entityType === 'fundingcasepayment') {
    const row = await db.selectFrom('Funding_Case_Agreement_Payment')
      .innerJoin('Funding_Case_Agreement_Commitment', 'Funding_Case_Agreement_Commitment.id', 'Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment')
      .select(['Funding_Case_Agreement_Payment.egcs_fc_fundingagreementcommitment as commitmentId', 'Funding_Case_Agreement_Commitment.egcs_fc_fundingagreement as agreementId'])
      .where('Funding_Case_Agreement_Payment.id', '=', entityId).where('Funding_Case_Agreement_Payment._deleted', '=', false).executeTakeFirst()
    if (!row) return null
    return { agreementId: String(row.agreementId), carriers: [
      { entityType: 'fundingcaseagreement', entityId: String(row.agreementId) },
      { entityType: 'fundingcaseagreementcommitment', entityId: String(row.commitmentId) },
      { entityType, entityId }
    ] }
  }
  const tableRows = entityType === 'fundingcaseamendment'
    ? await db.selectFrom('Funding_Case_Agreement_Amendment').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
    : entityType === 'fundingcaseagreementcloseout'
      ? await db.selectFrom('Funding_Case_Agreement_Closeout').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
      : entityType === 'fundingcaseagreementclaim'
        ? await db.selectFrom('Funding_Case_Agreement_Claim').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
        : entityType === 'fundingcaseagreementcommitment'
          ? await db.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
          : entityType === 'fundingcaseforecast'
            ? await db.selectFrom('Funding_Case_Agreement_Forecast').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
            : await db.selectFrom('Funding_Case_Agreement_Monitor').select('egcs_fc_fundingagreement').where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirst()
  if (!tableRows) return null
  const agreementId = String(tableRows.egcs_fc_fundingagreement)
  return { agreementId, carriers: [{ entityType: 'fundingcaseagreement', entityId: agreementId }, { entityType, entityId }] }
}

const lockCarrierStatus = async (
  trx: Transaction<Database>,
  carrier: { entityType: CoreLifecycleEntityType, entityId: string }
): Promise<StatusId> => {
  const entityId = carrier.entityId
  const row = carrier.entityType === 'fundingcaseagreement'
    ? await trx.selectFrom('Funding_Case_Agreement_Profile').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
    : carrier.entityType === 'fundingcaseamendment'
      ? await trx.selectFrom('Funding_Case_Agreement_Amendment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
      : carrier.entityType === 'fundingcaseagreementcloseout'
        ? await trx.selectFrom('Funding_Case_Agreement_Closeout').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
        : carrier.entityType === 'fundingcaseagreementclaim'
          ? await trx.selectFrom('Funding_Case_Agreement_Claim').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
          : carrier.entityType === 'fundingclaimreconcile'
            ? await trx.selectFrom('Funding_Case_Agreement_Claim_Reconcile').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
            : carrier.entityType === 'fundingcaseagreementcommitment'
              ? await trx.selectFrom('Funding_Case_Agreement_Commitment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
              : carrier.entityType === 'fundingcasepayment'
                ? await trx.selectFrom('Funding_Case_Agreement_Payment').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
                : carrier.entityType === 'fundingcaseforecast'
                  ? await trx.selectFrom('Funding_Case_Agreement_Forecast').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
                  : await trx.selectFrom('Funding_Case_Agreement_Monitor').select('egcs_fc_status').where('id', '=', entityId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!row) throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Business status carrier is unavailable')
  return String(row.egcs_fc_status)
}

const lockStatusDefinition = async (trx: Transaction<Database>, agencyId: string, statusId: StatusId) => {
  const status = await trx.selectFrom('Common_Status').select(['id', 'egcs_cn_agency', 'egcs_cn_readonly', 'egcs_cn_terminal', 'egcs_cn_isdraft'])
    .where('id', '=', statusId).where('_deleted', '=', false).forUpdate().executeTakeFirst()
  if (!status) throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Business status is unavailable')
  if (String(status.egcs_cn_agency) !== agencyId) throw new BusinessStatusViolation('BUSINESS_STATUS_AGENCY_MISMATCH', 'Business status belongs to another Agency')
  return { id: String(status.id), readOnly: status.egcs_cn_readonly, terminal: status.egcs_cn_terminal, isDraft: status.egcs_cn_isdraft }
}

/** Read-side projection matching the authoritative write lock across the target and its ancestors. */
export const isBusinessStatusLineageLocked = async (
  db: DbClient,
  entityType: CoreLifecycleEntityType,
  entityId: string
): Promise<boolean> => {
  const lineage = await resolveLineage(db, entityType, entityId)
  if (!lineage) return true
  for (const carrier of lineage.carriers) {
    const protection = await resolveBusinessStatusProtection(db, carrier.entityType, carrier.entityId)
    if (!protection || protection.terminal) return true
  }
  return false
}

export const lockBusinessStatus = async (
  trx: Transaction<Database>,
  entityType: CoreLifecycleEntityType,
  entityId: string,
  mode: BusinessStatusMutationMode = 'ordinary'
): Promise<LockedBusinessStatus> => {
  const lineage = await resolveLineage(trx, entityType, entityId)
  if (!lineage) throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Business status carrier is unavailable')
  const agreement = await trx.selectFrom('Funding_Case_Agreement_Profile')
    .innerJoin('Transfer_Payment_Stream', 'Transfer_Payment_Stream.id', 'Funding_Case_Agreement_Profile.egcs_fc_transferpaymentstream')
    .innerJoin('Transfer_Payment_Profile', 'Transfer_Payment_Profile.id', 'Transfer_Payment_Stream.egcs_tp_transferpaymentprofile')
    .select('Transfer_Payment_Profile.egcs_tp_agency as agencyId')
    .where('Funding_Case_Agreement_Profile.id', '=', lineage.agreementId).where('Funding_Case_Agreement_Profile._deleted', '=', false).executeTakeFirst()
  if (!agreement) throw new BusinessStatusViolation('BUSINESS_STATUS_NOT_FOUND', 'Business Agreement is unavailable')
  const agencyId = String(agreement.agencyId)
  const lockedCarriers: Array<BusinessStatusCarrier & { status: LockedBusinessStatus['status'], completed: boolean }> = []
  for (const carrier of lineage.carriers) {
    const statusId = await lockCarrierStatus(trx, carrier)
    const status = await lockStatusDefinition(trx, agencyId, statusId)
    const completion = await trx.selectFrom('Common_Completion').select('id')
      .where('egcs_cn_entitytype', '=', carrier.entityType).where('egcs_cn_entityid', '=', carrier.entityId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    lockedCarriers.push({ ...carrier, statusId, status, completed: Boolean(completion) })
  }
  const target = lockedCarriers.at(-1)!
  const terminal = lockedCarriers.find(carrier => carrier.status.terminal)
  if (terminal) throw new BusinessStatusViolation('BUSINESS_STATUS_TERMINAL', 'A terminal business record cannot be changed')
  if (mode === 'ordinary') {
    const registryEntry: BusinessStatusRegistryEntry = BUSINESS_STATUS_REGISTRY[entityType]
    const exemptAncestors = new Set<CoreLifecycleEntityType>(registryEntry.ordinaryLockExemptAncestors ?? [])
    const ordinaryBlockers = lockedCarriers.filter(carrier =>
      carrier.entityType === entityType || !exemptAncestors.has(carrier.entityType)
    )
    if (ordinaryBlockers.some(carrier => carrier.completed)) throw new BusinessStatusViolation('BUSINESS_COMPLETED', 'A completed business record cannot be changed')
    if (ordinaryBlockers.some(carrier => carrier.status.readOnly)) throw new BusinessStatusViolation('BUSINESS_STATUS_READ_ONLY', 'A read-only business record cannot be changed')
  }
  return {
    ...target,
    agencyId,
    agreementId: lineage.agreementId,
    authorizationRoot: { entityType: 'fundingcaseagreement', entityId: lineage.agreementId },
    ancestors: lockedCarriers.slice(0, -1)
  }
}

export const assertBusinessStatusMutationAllowed = async (
  event: H3Event,
  trx: Transaction<Database>,
  entityType: CoreLifecycleEntityType,
  entityId: string,
  mode: BusinessStatusMutationMode = 'ordinary'
) => {
  try {
    return await lockBusinessStatus(trx, entityType, entityId, mode)
  } catch (error: unknown) {
    if (!(error instanceof BusinessStatusViolation)) throw error
    return await throwApiError(event, {
      statusCode: 409,
      code: error.code,
      key: 'apiErrors.request.invalid_status'
    })
  }
}

const updateCarrierStatus = async (trx: Transaction<Database>, entityType: CoreLifecycleEntityType, entityId: string, statusId: StatusId, terminal: boolean) => {
  if (entityType === 'fundingcaseagreement') return await trx.updateTable('Funding_Case_Agreement_Profile').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcaseamendment') return await trx.updateTable('Funding_Case_Agreement_Amendment').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcaseagreementcloseout') return await trx.updateTable('Funding_Case_Agreement_Closeout').set({ egcs_fc_status: statusId, ...(terminal ? { egcs_fc_isopen: false } : {}) }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcaseagreementclaim') return await trx.updateTable('Funding_Case_Agreement_Claim').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingclaimreconcile') return await trx.updateTable('Funding_Case_Agreement_Claim_Reconcile').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcaseagreementcommitment') return await trx.updateTable('Funding_Case_Agreement_Commitment').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcasepayment') return await trx.updateTable('Funding_Case_Agreement_Payment').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (entityType === 'fundingcaseforecast') return await trx.updateTable('Funding_Case_Agreement_Forecast').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  return await trx.updateTable('Funding_Case_Agreement_Monitor').set({ egcs_fc_status: statusId }).where('id', '=', entityId).where('_deleted', '=', false).executeTakeFirstOrThrow()
}

export const transitionBusinessStatus = async (
  trx: Transaction<Database>,
  entityType: CoreLifecycleEntityType,
  entityId: string,
  nextStatusId: StatusId
): Promise<{ previousStatusId: StatusId, nextStatusId: StatusId, terminal: boolean }> => {
  const current = await lockBusinessStatus(trx, entityType, entityId, 'workflow')
  const next = await lockStatusDefinition(trx, current.agencyId, nextStatusId)
  await updateCarrierStatus(trx, entityType, entityId, next.id, next.terminal)
  return { previousStatusId: current.statusId, nextStatusId: next.id, terminal: next.terminal }
}
