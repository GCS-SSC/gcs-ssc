import type { H3Event } from 'h3'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { badRequest } from './api-errors'
import { throwIfMappedConstraintError } from './database-constraint-errors'

/**
 * Builds the bilateral list without granting access to the related Agreement itself.
 * @param db Database snapshot.
 * @param agreementId Authorized list owner.
 * @returns Bilateral relationship query.
 */
export const agreementRelationshipQuery = (db: Kysely<Database> | Transaction<Database>, agreementId: string) => db
  .selectFrom('Funding_Case_Agreement_Relationship as relationship')
  .innerJoin('Funding_Case_Agreement_Profile as related', join => join.on(eb => eb.or([
    eb.and([eb('relationship.egcs_fc_fundingagreement', '=', agreementId), eb('related.id', '=', eb.ref('relationship.egcs_fc_relatedagreement'))]),
    eb.and([eb('relationship.egcs_fc_relatedagreement', '=', agreementId), eb('related.id', '=', eb.ref('relationship.egcs_fc_fundingagreement'))])
  ])))
  .innerJoin('Transfer_Payment_Stream as stream', 'stream.id', 'related.egcs_fc_transferpaymentstream')
  .innerJoin('Transfer_Payment_Profile as program', 'program.id', 'stream.egcs_tp_transferpaymentprofile')
  .innerJoin('Agency_Agreement_Relationship_Type as type', 'type.id', 'relationship.egcs_fc_relationshiptype')
  .where('relationship._deleted', '=', false)
  .where('related._deleted', '=', false)

/**
 * Locks an active definition from the owning Agency before saving a link.
 * @param event Request event.
 * @param trx Authorized write transaction.
 * @param agencyId Owning Agency.
 * @param typeId Selected definition.
 * @returns Active owned definition.
 */
export const assertAgreementRelationshipType = async (
  event: H3Event, trx: Transaction<Database>, agencyId: string, typeId: string
) => {
  const type = await trx.selectFrom('Agency_Agreement_Relationship_Type')
    .select('id').where('id', '=', typeId).where('egcs_ay_organizationagency', '=', agencyId)
    .where('_deleted', '=', false).forShare().executeTakeFirst()
  if (!type) return await badRequest(event, 'INVALID_AGREEMENT_RELATIONSHIP', 'apiErrors.agreement.invalid_relationship')
  return type
}

/**
 * Translates only the relationship constraints owned by this feature.
 * @param event Request event.
 * @param error Database failure.
 * @returns Throws a localized error or rethrows the original failure.
 */
export const throwAgreementRelationshipError = async (event: H3Event, error: unknown): Promise<never> =>
  await throwIfMappedConstraintError(event, error, ['23505', '23514'], {
    fc_uq_agreement_relationship_pair: { code: 'DUPLICATE_AGREEMENT_RELATIONSHIP', key: 'apiErrors.agreement.duplicate_relationship' },
    fc_chk_agreement_relationship_distinct: { code: 'INVALID_AGREEMENT_RELATIONSHIP', key: 'apiErrors.agreement.invalid_relationship' },
    fc_chk_agreement_relationship_agency: { code: 'INVALID_AGREEMENT_RELATIONSHIP', key: 'apiErrors.agreement.invalid_relationship' }
  })
