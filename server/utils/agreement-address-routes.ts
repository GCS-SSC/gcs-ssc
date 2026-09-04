/* eslint-disable jsdoc/require-jsdoc -- Agreement address helpers expose typed contracts covered by route tests. */
import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import { badRequest, notFound } from '~~/server/utils/api-errors'
import { readValidatedBodyI18n } from '~~/server/utils/api-validate'
import {
  AGREEMENT_CHILD_ERROR_KEYS,
  assertAgreementChildExists,
  assertAgreementExists
} from '~~/server/utils/agreement-child-resources'
import { AGREEMENT_ADDRESS_SELECT_COLUMNS } from '~~/server/utils/agreement-address-columns'
import { FundingCaseAgreementAddressPatchSchema } from '~~/shared/types/schemas'
import type { Database } from '~~/shared/types/database'

type AgreementAddressDb = Kysely<Database> | Transaction<Database>

/**
 * Locks an active common address before deciding whether it is safe to mutate.
 *
 * @param db - Owning Agreement write transaction.
 * @param commonAddressId - Common address identifier to lock.
 * @returns The active locked address, or undefined when it is no longer active.
 */
export const lockActiveAgreementCommonAddress = async (
  db: AgreementAddressDb,
  commonAddressId: string
) => await db
  .selectFrom('Common_Address')
  .where('id', '=', commonAddressId)
  .where('_deleted', '=', false)
  .select('id')
  .forUpdate()
  .executeTakeFirst()

/**
 * Checks all other active Proponent and Agreement links for a common address.
 *
 * @param db - Owning Agreement write transaction.
 * @param commonAddressId - Common address identifier to inspect.
 * @param excludedAgreementAddressId - Current Agreement address link omitted from the check.
 * @returns Whether another active link still references the common address.
 */
export const hasOtherActiveAgreementCommonAddressReferences = async (
  db: AgreementAddressDb,
  commonAddressId: string,
  excludedAgreementAddressId: string
): Promise<boolean> => {
  const applicantRecipientAddress = await db
    .selectFrom('Applicant_Recipient_Address')
    .where('egcs_ar_address', '=', commonAddressId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()
  if (applicantRecipientAddress) {
    return true
  }

  const agreementAddress = await db
    .selectFrom('Funding_Case_Agreement_Address')
    .where('egcs_fc_address', '=', commonAddressId)
    .where('id', '!=', excludedAgreementAddressId)
    .where('_deleted', '=', false)
    .select('id')
    .executeTakeFirst()

  return Boolean(agreementAddress)
}

const selectAgreementAddress = (
  db: AgreementAddressDb,
  agreementId: string,
  childId: string
) => db
  .selectFrom('Funding_Case_Agreement_Address')
  .innerJoin('Common_Address', 'Common_Address.id', 'Funding_Case_Agreement_Address.egcs_fc_address')
  .innerJoin('Agency_Address_Type', 'Agency_Address_Type.id', 'Funding_Case_Agreement_Address.egcs_fc_addresstype')
  .where('Funding_Case_Agreement_Address.id', '=', childId)
  .where('Funding_Case_Agreement_Address.egcs_fc_fundingagreement', '=', agreementId)
  .where('Funding_Case_Agreement_Address._deleted', '=', false)
  .where('Common_Address._deleted', '=', false)
  .where('Agency_Address_Type._deleted', '=', false)
  .select(AGREEMENT_ADDRESS_SELECT_COLUMNS)

const fetchAgreementAddress = async (
  db: AgreementAddressDb,
  agreementId: string,
  childId: string
) => await selectAgreementAddress(db, agreementId, childId).executeTakeFirst()

const fetchAgreementAddressOrThrow = async (
  db: AgreementAddressDb,
  agreementId: string,
  childId: string
) => await selectAgreementAddress(db, agreementId, childId).executeTakeFirstOrThrow()

const assertAgreementAddressType = async (
  event: H3Event,
  db: AgreementAddressDb,
  agencyId: string,
  addressTypeId: string | undefined
) => {
  if (!addressTypeId) {
    return null
  }

  const addressType = await db
    .selectFrom('Agency_Address_Type')
    .where('id', '=', addressTypeId)
    .where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false)
    .select('id')
    .forUpdate()
    .executeTakeFirst()

  if (!addressType) {
    return await badRequest(event, 'INVALID_AGREEMENT_ADDRESS_TYPE', 'apiErrors.agreement.invalid_address_type')
  }

  return null
}

export const patchAgreementAddress = async (
  event: H3Event,
  db: AgreementAddressDb,
  agreementId: string,
  childId: string,
  agencyId: string
) => {
  const agreement = await assertAgreementExists(event, agreementId, db)
  if (!agreement || typeof agreement !== 'object' || !('id' in agreement)) {
    return agreement
  }

  const existing = await assertAgreementChildExists(
    event,
    fetchAgreementAddress(db, agreementId, childId),
    ...AGREEMENT_CHILD_ERROR_KEYS.addressNotFound
  )
  if (!existing || typeof existing !== 'object' || !('id' in existing)) {
    return existing
  }

  const readBody = (globalThis as { readValidatedBodyI18n?: typeof readValidatedBodyI18n }).readValidatedBodyI18n ?? readValidatedBodyI18n
  const validated = await readBody(event, FundingCaseAgreementAddressPatchSchema)
  const values = Object.fromEntries(Object.entries(validated).filter(([, value]) => value !== undefined))

  if (!Object.keys(values).length) {
    return existing
  }

  const addressTypeGuard = await assertAgreementAddressType(event, db, agencyId, validated.egcs_fc_addresstype)
  if (addressTypeGuard) {
    return addressTypeGuard
  }

  const { egcs_fc_addresstype: addressTypeId, ...addressValues } = values

  if (Object.keys(addressValues).length) {
    const commonAddress = await lockActiveAgreementCommonAddress(db, existing.egcs_fc_address)
    if (!commonAddress) {
      return await notFound(event, ...AGREEMENT_CHILD_ERROR_KEYS.addressNotFound)
    }

    const addressIsShared = await hasOtherActiveAgreementCommonAddressReferences(
      db,
      existing.egcs_fc_address,
      childId
    )
    if (addressIsShared) {
      return await badRequest(
        event,
        'AGREEMENT_ADDRESS_SHARED',
        'apiErrors.applicant_recipient.address_shared'
      )
    }
  }

  if (addressTypeId) {
    await db
      .updateTable('Funding_Case_Agreement_Address')
      .set({ egcs_fc_addresstype: String(addressTypeId) })
      .where('id', '=', childId)
      .where('egcs_fc_fundingagreement', '=', agreementId)
      .where('_deleted', '=', false)
      .execute()
  }

  if (Object.keys(addressValues).length) {
    await db
      .updateTable('Common_Address')
      .set(addressValues)
      .where('id', '=', existing.egcs_fc_address)
      .where('_deleted', '=', false)
      .execute()
  }

  return await fetchAgreementAddressOrThrow(db, agreementId, childId)
}
