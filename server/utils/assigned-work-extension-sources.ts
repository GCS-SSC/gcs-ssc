import { sql, type RawBuilder } from 'kysely'
import { getRegisteredExtensions, loadExtensionLifecycleEntity } from './extensions'

/**
 * Builds canonical, enabled qualified-source bindings against the caller's base_work CTE.
 * @returns SQL projecting available typed source identities and their canonical owner identities.
 */
export const buildAssignedWorkExtensionSources = async (): Promise<RawBuilder<unknown>> => {
  const extensions = await getRegisteredExtensions()
  const definitions = await Promise.all(extensions.flatMap(extension =>
    (extension.entities ?? []).map(async definition => {
      const loaded = await loadExtensionLifecycleEntity(definition.type)
      return loaded
        ? {
            type: loaded.definition.type,
            extensionKey: loaded.extension.key,
            ownerType: loaded.definition.ownerKind === 'agreement' ? 'fundingcaseagreement' : 'applicantrecipient'
          }
        : null
    })))
  const available = definitions.filter(definition => definition !== null)
  if (available.length === 0) {
    return sql`SELECT NULL::bigint entity_id, NULL::text entity_type,
      NULL::bigint owner_id, NULL::text owner_type WHERE FALSE`
  }
  const metadata = sql.join(available.map(definition => sql`(
    ${definition.type}::text, ${definition.extensionKey}::text, ${definition.ownerType}::text
  )`))
  return sql`
    SELECT target.id entity_id, target.egcs_cn_entitytype::text entity_type,
      owner.id owner_id, owner.entity_type owner_type
    FROM (VALUES ${metadata}) installed(entity_type, extension_key, owner_type)
    JOIN "Common_Extension_Entity_Owner" binding
      ON binding.egcs_cn_entitytype = installed.entity_type
      AND binding.egcs_cn_ownertype = installed.owner_type
    JOIN "Common_Entity" target ON target.id = binding.egcs_cn_entityid
      AND target.egcs_cn_entitytype = binding.egcs_cn_entitytype AND target._deleted = false
    JOIN "Common_Entity" identity_owner ON identity_owner.id = binding.egcs_cn_ownerid
      AND identity_owner.egcs_cn_entitytype = binding.egcs_cn_ownertype AND identity_owner._deleted = false
    JOIN base_work owner ON owner.id = binding.egcs_cn_ownerid
      AND owner.entity_type = binding.egcs_cn_ownertype
    JOIN "Agency_Profile" agency ON agency.id = owner.agency_id AND agency._deleted = false
    WHERE EXISTS (
      SELECT 1 FROM extensions.agency_enablement enabled
      WHERE enabled.extension_key = installed.extension_key AND enabled.agency_id = owner.agency_id
        AND enabled.enabled = true AND enabled._deleted = false
    ) AND (installed.owner_type = 'applicantrecipient' OR EXISTS (
      SELECT 1 FROM "Funding_Case_Agreement_Profile" agreement
      JOIN extensions.stream_configuration enabled
        ON enabled.stream_id = agreement.egcs_fc_transferpaymentstream
        AND enabled.extension_key = installed.extension_key AND enabled.enabled = true AND enabled._deleted = false
      WHERE agreement.id = owner.id AND agreement._deleted = false
    ))`
}
