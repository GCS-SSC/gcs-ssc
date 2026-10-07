import { sql, type RawBuilder } from 'kysely'
import { getRegisteredExtensions, loadExtensionLifecycleEntity } from './extensions'
import { ENTITY_AUTHORIZATION_POLICIES } from '~~/shared/utils/entity-assignments'

/**
 * Follows only the actor's exact assignment targets and their owning/source ancestors.
 * Every edge probes an identity through its primary key; an unassigned parent is still resolved.
 * @returns Recursive assignment-path projection.
 */
export const buildAssignedWorkAssignmentLineage = (): RawBuilder<unknown> => {
  const agreementChildren = Object.entries(ENTITY_AUTHORIZATION_POLICIES)
    .filter(([, policy]) => policy.ownerResolver === 'agreement_parent')
  const edges = agreementChildren.map(([entityType, policy]) => sql`
    SELECT child.egcs_fc_fundingagreement id, 'fundingcaseagreement'::text entity_type
    FROM ${sql.table(policy.table)} child
    WHERE path.entity_type = ${entityType} AND child.id = path.id AND NOT child._deleted
    OFFSET 0`)
  return sql`
    SELECT assignment.entity_id origin_id, assignment.entity_type origin_type,
      assignment.entity_id id, assignment.entity_type,
      ARRAY[assignment.entity_type || ':' || assignment.entity_id::text] visited
    FROM actor_assignments assignment
    UNION ALL
    SELECT path.origin_id, path.origin_type, ancestor.id, ancestor.entity_type,
      path.visited || (ancestor.entity_type || ':' || ancestor.id::text)
    FROM assignment_paths path
    JOIN LATERAL (
      ${sql.join(edges.map(edge => sql`(${edge})`), sql` UNION ALL `)}
      UNION ALL
      (SELECT claim.egcs_fc_fundingagreementclaim, 'fundingcaseagreementclaim'
        FROM "Funding_Case_Agreement_Claim_Reconcile" claim
        WHERE path.entity_type = 'fundingclaimreconcile' AND claim.id = path.id AND NOT claim._deleted OFFSET 0)
      UNION ALL
      (SELECT review_set.egcs_cn_entityid, review_set.egcs_cn_entitytype::text
        FROM "Common_Review" review
        JOIN LATERAL (SELECT target.* FROM "Common_Review_Set" target
      WHERE target.id = review.egcs_cn_reviewset AND NOT target._deleted OFFSET 0) review_set ON TRUE
        WHERE path.entity_type = 'commonreview' AND review.id = path.id AND NOT review._deleted OFFSET 0)
      UNION ALL
      (SELECT recommendation.egcs_cn_entityid, recommendation.egcs_cn_entitytype::text
        FROM "Common_Recommendation" recommendation
        WHERE path.entity_type = 'commonrecommendation' AND recommendation.id = path.id AND NOT recommendation._deleted OFFSET 0)
      UNION ALL
      (SELECT memo.egcs_fc_receivable, 'fundingcaseaccountreceivable'
        FROM "Funding_Case_Account_Receivable_Credit_Memo" memo
        WHERE path.entity_type = 'fundingcaseaccountreceivablecreditmemo' AND memo.id = path.id AND NOT memo._deleted OFFSET 0)
      UNION ALL
      (SELECT binding.egcs_cn_ownerid, binding.egcs_cn_ownertype::text
        FROM "Common_Extension_Entity_Owner" binding
        WHERE position(':' in path.entity_type) > 0
          AND binding.egcs_cn_entityid = path.id AND binding.egcs_cn_entitytype = path.entity_type OFFSET 0)
      LIMIT 1
    ) ancestor ON NOT (ancestor.entity_type || ':' || ancestor.id::text) = ANY(path.visited)
  `
}

/**
 * Resolves only qualified sources present in the actor's required ancestor chain.
 * @returns Enabled, correctly typed qualified owner bindings.
 */
export const buildAssignedWorkSearchQualifiedBindings = async (): Promise<RawBuilder<unknown>> => {
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
  if (available.length === 0) return sql`SELECT NULL::bigint entity_id, NULL::text entity_type,
    NULL::bigint owner_id, NULL::text owner_type, NULL::bigint agency_id WHERE FALSE`
  const metadata = sql.join(available.map(definition => sql`(
    ${definition.type}::text, ${definition.extensionKey}::text, ${definition.ownerType}::text
  )`))
  return sql`
    SELECT needed.id entity_id, needed.entity_type, owner.id owner_id,
      owner.entity_type owner_type, agency.id agency_id
    FROM needed_identities needed
    JOIN (VALUES ${metadata}) installed(entity_type, extension_key, owner_type)
      ON installed.entity_type = needed.entity_type
    JOIN LATERAL (
      SELECT source.* FROM "Common_Extension_Entity_Owner" source
      WHERE source.egcs_cn_entityid = needed.id AND source.egcs_cn_entitytype = needed.entity_type OFFSET 0
    ) binding ON binding.egcs_cn_ownertype = installed.owner_type
    JOIN LATERAL (SELECT identity.id FROM "Common_Entity" identity
      WHERE identity.id = needed.id AND identity.egcs_cn_entitytype = needed.entity_type AND NOT identity._deleted OFFSET 0) target ON TRUE
    JOIN LATERAL (SELECT identity.id FROM "Common_Entity" identity
      WHERE identity.id = binding.egcs_cn_ownerid AND identity.egcs_cn_entitytype = binding.egcs_cn_ownertype AND NOT identity._deleted OFFSET 0) identity_owner ON TRUE
    JOIN source_facts owner ON owner.id = binding.egcs_cn_ownerid
      AND owner.entity_type = binding.egcs_cn_ownertype
    JOIN "Agency_Profile" agency ON agency.id = CASE
      WHEN installed.owner_type = 'applicantrecipient' THEN binding.egcs_cn_agency
      ELSE owner.agency_id END AND NOT agency._deleted
    WHERE EXISTS (
      SELECT 1 FROM extensions.agency_enablement enabled
      WHERE enabled.extension_key = installed.extension_key AND enabled.agency_id = agency.id
        AND enabled.enabled AND NOT enabled._deleted
    ) AND (installed.owner_type = 'applicantrecipient' OR EXISTS (
      SELECT 1 FROM "Funding_Case_Agreement_Profile" agreement
      JOIN extensions.stream_configuration enabled ON enabled.stream_id = agreement.egcs_fc_transferpaymentstream
        AND enabled.extension_key = installed.extension_key AND enabled.enabled AND NOT enabled._deleted
      WHERE agreement.id = owner.id AND NOT agreement._deleted
    ))`
}

/**
 * Resolves identity and authorization fields for the finite set of required source rows.
 * @returns Identity-only source projections using primary-key lookups.
 */
export const buildAssignedWorkSearchSourceFacts = (): RawBuilder<unknown> => {
  const agreementChildren = Object.entries(ENTITY_AUTHORIZATION_POLICIES)
    .filter(([, policy]) => policy.ownerResolver === 'agreement_parent')
  const childSources = agreementChildren.map(([entityType, policy]) => {
    let nameEn = sql`'#' || item.id::text`
    let nameFr = nameEn
    let reference = nameEn
    let identityJoins = sql``
    if (entityType === 'fundingcaseamendment') {
      nameEn = sql`COALESCE(item.egcs_fc_name_en, '#' || item.id::text)`
      nameFr = sql`COALESCE(item.egcs_fc_name_fr, '#' || item.id::text)`
      reference = sql`item.egcs_fc_amendmentnumber::text`
    } else if (entityType === 'fundingcasecorrection' || entityType === 'fundingcaseaccountreceivable' || entityType === 'fundingcasejournalvoucher') {
      const marker = entityType === 'fundingcasecorrection' ? '-COR-' : entityType === 'fundingcaseaccountreceivable' ? '-AR-' : '-JV-'
      reference = sql`item.egcs_fc_agreementnumber || ${marker} || item.egcs_fc_number::text`
      nameEn = reference
      nameFr = reference
    } else if (entityType === 'fundingcaseagreementcloseout') {
      reference = sql`item.egcs_fc_closeoutnumber::text`
    } else if (entityType === 'fundingcasemonitor') {
      identityJoins = sql`LEFT JOIN "Transfer_Payment_Monitor_Type" stream_type ON stream_type.id = item.egcs_fc_type AND NOT stream_type._deleted
        LEFT JOIN "Agency_Monitor_Type" identity_type ON identity_type.id = stream_type.egcs_tp_agencymonitortype AND NOT identity_type._deleted`
      nameEn = sql`COALESCE(identity_type.egcs_ay_name_en, '#' || item.id::text)`
      nameFr = sql`COALESCE(identity_type.egcs_ay_name_fr, '#' || item.id::text)`
    } else if (entityType === 'fundingcaseagreementcommitment') {
      identityJoins = sql`LEFT JOIN "Transfer_Payment_Stream_Commitment_Type" stream_type ON stream_type.id = item.egcs_fc_type AND NOT stream_type._deleted
        LEFT JOIN "Agency_Commitment_Type" identity_type ON identity_type.id = stream_type.egcs_tp_agencycommitmenttype AND NOT identity_type._deleted`
      nameEn = sql`COALESCE(identity_type.egcs_ay_name_en, '#' || item.id::text)`
      nameFr = sql`COALESCE(identity_type.egcs_ay_name_fr, '#' || item.id::text)`
    }
    return sql`
      SELECT item.id, ${entityType}::text entity_type, item.egcs_fc_status::text status,
        ${nameEn} name_en, ${nameFr} name_fr, ${reference} reference,
        item.egcs_fc_fundingagreement agreement_id, NULL::bigint proponent_id, NULL::text variant,
        ${policy.subject}::text owner_subject, program.egcs_tp_agency agency_id, program.id program_id,
        NULL::bigint schema_agency
      FROM needed_identities needed
      JOIN LATERAL (SELECT target.* FROM ${sql.table(policy.table)} target
        WHERE target.id = needed.id AND needed.entity_type = ${entityType} AND NOT target._deleted OFFSET 0) item ON TRUE
      JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Profile" target
      WHERE target.id = item.egcs_fc_fundingagreement AND NOT target._deleted OFFSET 0) agreement ON TRUE
      JOIN LATERAL (SELECT target.id, target.egcs_tp_transferpaymentprofile FROM "Transfer_Payment_Stream" target
      WHERE target.id = agreement.egcs_fc_transferpaymentstream AND NOT target._deleted OFFSET 0) stream ON TRUE
      JOIN LATERAL (SELECT target.id, target.egcs_tp_agency FROM "Transfer_Payment_Profile" target
      WHERE target.id = stream.egcs_tp_transferpaymentprofile AND NOT target._deleted OFFSET 0) program ON TRUE
      ${identityJoins}`
  })
  return sql`
    SELECT profile.id, 'applicantrecipient'::text entity_type,
      CASE WHEN profile.egcs_ar_active THEN 'active' ELSE 'inactive' END status,
      COALESCE(profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en, profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr, '#' || profile.id::text) name_en,
      COALESCE(profile.egcs_ar_legalname_fr, profile.egcs_ar_operatingname_fr, profile.egcs_ar_legalname_en, profile.egcs_ar_operatingname_en, '#' || profile.id::text) name_fr,
      NULL::text reference, NULL::bigint agreement_id, profile.id proponent_id, NULL::text variant,
      'applicant_recipient'::text owner_subject, profile.egcs_ar_leadagency agency_id, NULL::bigint program_id,
      NULL::bigint schema_agency
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Applicant_Recipient_Profile" target
      WHERE target.id = needed.id AND needed.entity_type = 'applicantrecipient' AND NOT target._deleted OFFSET 0) profile ON TRUE
    UNION ALL
    SELECT agreement.id, 'fundingcaseagreement', agreement.egcs_fc_status::text,
      agreement.egcs_fc_title_en, agreement.egcs_fc_title_fr, agreement.egcs_fc_agreementnumber,
      agreement.id, NULL::bigint, NULL::text, 'agreement', program.egcs_tp_agency, program.id, NULL::bigint
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Profile" target
      WHERE target.id = needed.id AND needed.entity_type = 'fundingcaseagreement' AND NOT target._deleted OFFSET 0) agreement ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_transferpaymentprofile FROM "Transfer_Payment_Stream" target
      WHERE target.id = agreement.egcs_fc_transferpaymentstream AND NOT target._deleted OFFSET 0) stream ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_agency FROM "Transfer_Payment_Profile" target
      WHERE target.id = stream.egcs_tp_transferpaymentprofile AND NOT target._deleted OFFSET 0) program ON TRUE
    UNION ALL
    SELECT intake.id, 'fundingcaseintake', intake.egcs_fi_status::text,
      'Application #' || intake.id::text, 'Demande no ' || intake.id::text,
      COALESCE(intake.egcs_fi_externalsourceid, intake.egcs_fi_applicationid::text), NULL::bigint, intake.egcs_fi_applicantrecipient, NULL::text,
      'funding_case', program.egcs_tp_agency, program.id, NULL::bigint
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Intake_Profile" target
      WHERE target.id = needed.id AND needed.entity_type = 'fundingcaseintake' AND NOT target._deleted OFFSET 0) intake ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Funding_Opportunity_Profile" target
      WHERE target.id = intake.egcs_fi_fundingopportunity AND NOT target._deleted OFFSET 0) opportunity ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_transferpaymentprofile FROM "Transfer_Payment_Stream" target
      WHERE target.id = opportunity.egcs_fo_transferpaymentstream AND NOT target._deleted OFFSET 0) stream ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_agency FROM "Transfer_Payment_Profile" target
      WHERE target.id = stream.egcs_tp_transferpaymentprofile AND NOT target._deleted OFFSET 0) program ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Applicant_Recipient_Profile" target
      WHERE target.id = intake.egcs_fi_applicantrecipient AND NOT target._deleted OFFSET 0) proponent ON TRUE
    UNION ALL
    ${sql.join(childSources, sql` UNION ALL `)}
    UNION ALL
    SELECT reconcile.id, 'fundingclaimreconcile', reconcile.egcs_fc_status::text,
      '#' || reconcile.id::text, '#' || reconcile.id::text, '#' || reconcile.id::text,
      claim.egcs_fc_fundingagreement, NULL::bigint, NULL::text, 'agreement', program.egcs_tp_agency, program.id, NULL::bigint
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Claim_Reconcile" target
      WHERE target.id = needed.id AND needed.entity_type = 'fundingclaimreconcile' AND NOT target._deleted OFFSET 0) reconcile ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Claim" target
      WHERE target.id = reconcile.egcs_fc_fundingagreementclaim AND NOT target._deleted OFFSET 0) claim ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Profile" target
      WHERE target.id = claim.egcs_fc_fundingagreement AND NOT target._deleted OFFSET 0) agreement ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_transferpaymentprofile FROM "Transfer_Payment_Stream" target
      WHERE target.id = agreement.egcs_fc_transferpaymentstream AND NOT target._deleted OFFSET 0) stream ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_agency FROM "Transfer_Payment_Profile" target
      WHERE target.id = stream.egcs_tp_transferpaymentprofile AND NOT target._deleted OFFSET 0) program ON TRUE
    UNION ALL
    SELECT memo.id, 'fundingcaseaccountreceivablecreditmemo', memo.egcs_fc_status::text,
      'CM-' || memo.egcs_fc_number::text, 'CM-' || memo.egcs_fc_number::text,
      'CM-' || memo.egcs_fc_number::text, NULL::bigint, memo.egcs_fc_applicantrecipient, NULL::text,
      'account_receivable', memo.egcs_fc_agency, NULL::bigint, NULL::bigint
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Account_Receivable_Credit_Memo" target
      WHERE target.id = needed.id AND needed.entity_type = 'fundingcaseaccountreceivablecreditmemo' AND NOT target._deleted OFFSET 0) memo ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Funding_Case_Agreement_Account_Receivable" target
      WHERE target.id = memo.egcs_fc_receivable AND NOT target._deleted OFFSET 0) debt ON TRUE
    JOIN "Funding_Case_Account_Receivable_Pool" pool ON pool.id = memo.egcs_fc_pool AND NOT pool._deleted
      AND pool.egcs_fc_agency = memo.egcs_fc_agency AND pool.egcs_fc_applicantrecipient = memo.egcs_fc_applicantrecipient AND pool.egcs_fc_currency = memo.egcs_fc_currency
      AND debt.egcs_fc_pool = pool.id AND debt.egcs_fc_applicantrecipient = pool.egcs_fc_applicantrecipient AND debt.egcs_fc_currency = pool.egcs_fc_currency
    JOIN LATERAL (SELECT target.* FROM "Applicant_Recipient_Profile" target
      WHERE target.id = memo.egcs_fc_applicantrecipient AND NOT target._deleted OFFSET 0) proponent ON TRUE
    UNION ALL
    SELECT review.id, 'commonreview', runtime_item.egcs_cn_state::text,
      schema.egcs_cn_name_en, schema.egcs_cn_name_fr, '#' || review.id::text,
      NULL::bigint, NULL::bigint, CASE WHEN checklist.id IS NULL THEN 'assessment' ELSE 'checklist' END,
      NULL::text, NULL::bigint, NULL::bigint, schema.egcs_cn_agency
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Common_Review" target
      WHERE target.id = needed.id AND needed.entity_type = 'commonreview' AND NOT target._deleted OFFSET 0) review ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Runtime_Item" target
      WHERE target.id = review.egcs_cn_runtimeitem AND NOT target._deleted OFFSET 0) runtime_item ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Runtime" target
      WHERE target.id = runtime_item.egcs_cn_runtime AND NOT target._deleted OFFSET 0) runtime ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Review_Set" target
      WHERE target.id = review.egcs_cn_reviewset AND NOT target._deleted OFFSET 0) review_set ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Review_Schema" target
      WHERE target.id = review.egcs_cn_reviewschema AND NOT target._deleted OFFSET 0) schema ON TRUE
    LEFT JOIN "Common_Checklist" checklist ON checklist.egcs_cn_review = review.id AND NOT checklist._deleted
    UNION ALL
    SELECT recommendation.id, 'commonrecommendation', runtime_item.egcs_cn_state::text,
      schema.egcs_cn_name_en, schema.egcs_cn_name_fr, '#' || recommendation.id::text,
      NULL::bigint, NULL::bigint, NULL::text, NULL::text, NULL::bigint, NULL::bigint, schema.egcs_cn_agency
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Common_Recommendation" target
      WHERE target.id = needed.id AND needed.entity_type = 'commonrecommendation' AND NOT target._deleted OFFSET 0) recommendation ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Runtime_Item" target
      WHERE target.id = recommendation.egcs_cn_runtimeitem AND NOT target._deleted OFFSET 0) runtime_item ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Runtime" target
      WHERE target.id = runtime_item.egcs_cn_runtime AND NOT target._deleted OFFSET 0) runtime ON TRUE
    JOIN LATERAL (SELECT target.* FROM "Common_Recommendation_Schema" target
      WHERE target.id = runtime_item.egcs_cn_publication AND NOT target._deleted OFFSET 0) schema ON TRUE
    UNION ALL
    SELECT stream.id, 'transferpaymentstream', 'active', stream.egcs_tp_name_en, stream.egcs_tp_name_fr,
      NULL::text, NULL::bigint, NULL::bigint, NULL::text, 'transfer_payment', program.egcs_tp_agency, program.id, NULL::bigint
    FROM needed_identities needed
    JOIN LATERAL (SELECT target.* FROM "Transfer_Payment_Stream" target
      WHERE target.id = needed.id AND needed.entity_type = 'transferpaymentstream' AND NOT target._deleted OFFSET 0) stream ON TRUE
    JOIN LATERAL (SELECT target.id, target.egcs_tp_agency FROM "Transfer_Payment_Profile" target
      WHERE target.id = stream.egcs_tp_transferpaymentprofile AND NOT target._deleted OFFSET 0) program ON TRUE
  `
}
