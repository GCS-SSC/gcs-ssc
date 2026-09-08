import type { Kysely } from 'kysely'
import type { GcsLifecycleEntityOwnerResolution, GcsLifecycleEntityScopeResolution } from '@gcs-ssc/extensions/server'
import type { Database, Entity_Type } from '~~/shared/types/database'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import { resolveAgreementScopeContext } from './agreement'

type CanonicalLifecycleIdentity = {
  owner: GcsLifecycleEntityOwnerResolution
  scope: GcsLifecycleEntityScopeResolution
}

/**
 * Resolves the active typed owner binding without trusting an extension adapter.
 * @param trx Database connection or active transaction.
 * @param entityType Qualified source type.
 * @param entityId Registered source identity.
 * @returns Active canonical owner and scope, or null when unavailable.
 */
export const resolveCanonicalLifecycleIdentity = async (
  trx: Kysely<Database>,
  entityType: Entity_Type,
  entityId: string
): Promise<CanonicalLifecycleIdentity | null> => {
  if (!entityType.includes(':') || !isPositivePostgresBigintText(entityId)) return null
  const target = await trx.selectFrom('Common_Entity').select('id')
    .where('id', '=', entityId).where('egcs_cn_entitytype', '=', entityType)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!target) return null

  const binding = await trx.selectFrom('Common_Extension_Entity_Owner')
    .select(['egcs_cn_ownerid as ownerId', 'egcs_cn_ownertype as ownerType'])
    .where('egcs_cn_entityid', '=', entityId)
    .where('egcs_cn_entitytype', '=', entityType)
    .executeTakeFirst()
  if (!binding || !isPositivePostgresBigintText(String(binding.ownerId))) return null
  if (binding.ownerType !== 'fundingcaseagreement' && binding.ownerType !== 'applicantrecipient') return null

  const ownerEntityType = binding.ownerType
  const identity = await trx.selectFrom('Common_Entity').select('id')
    .where('id', '=', String(binding.ownerId))
    .where('egcs_cn_entitytype', '=', ownerEntityType)
    .where('_deleted', '=', false)
    .executeTakeFirst()
  if (!identity) return null

  const ownerId = String(identity.id)
  if (ownerEntityType === 'fundingcaseagreement') {
    const agreement = await resolveAgreementScopeContext(ownerId, trx)
    if (!agreement) return null
    return {
      owner: {
        owner: 'agreement',
        ownerId,
        agencyId: agreement.agencyId,
        streamId: agreement.streamId
      },
      scope: {
        agencyId: agreement.agencyId,
        streamId: agreement.streamId,
        scope: {
          type: 'entity',
          agencyId: agreement.agencyId,
          path: [{ type: 'transferpaymentstream', id: agreement.streamId }]
        }
      }
    }
  }

  const profile = await trx.selectFrom('Applicant_Recipient_Profile')
    .innerJoin('Agency_Profile', 'Agency_Profile.id', 'Applicant_Recipient_Profile.egcs_ar_leadagency')
    .select('Applicant_Recipient_Profile.egcs_ar_leadagency as agencyId')
    .where('Applicant_Recipient_Profile.id', '=', ownerId)
    .where('Applicant_Recipient_Profile._deleted', '=', false)
    .where('Agency_Profile._deleted', '=', false)
    .executeTakeFirst()
  if (!profile?.agencyId) return null
  const agencyId = String(profile.agencyId)
  return {
    owner: { owner: 'proponent', ownerId, agencyId },
    scope: { agencyId, scope: { type: 'agency', agencyId } }
  }
}
