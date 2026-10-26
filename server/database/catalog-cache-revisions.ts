import { sql, type Kysely } from 'kysely'
import type { Database } from '../../shared/types/database'
import { CATALOG_GROUPS } from '../../shared/utils/catalog-cache'

/**
 * Restores revisions omitted by demo snapshots without replacing existing values.
 * @param db - Database after restoring Agency rows.
 */
export const initializeCatalogCacheRevisions = async <DB>(db: Kysely<DB>): Promise<void> => {
  await sql`
    INSERT INTO "Agency_Catalog_Revision" (egcs_ay_agency, egcs_ay_cataloggroup, egcs_ay_revision)
    SELECT agency.id, cataloggroup, catalog_cache_nanoid()
    FROM "Agency_Profile" agency CROSS JOIN unnest(${[...CATALOG_GROUPS]}::text[]) cataloggroup
    ORDER BY agency.id, cataloggroup
    ON CONFLICT (egcs_ay_agency, egcs_ay_cataloggroup) DO NOTHING
  `.execute(db)
}

/**
 * Installs transactional revision generation and catalog ownership resolution.
 * @param db - Fresh database after all subject tables exist.
 */
export const installCatalogCacheFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    DO $catalog$ BEGIN
    CREATE FUNCTION catalog_cache_nanoid() RETURNS text LANGUAGE plpgsql VOLATILE AS $function$
    DECLARE
      alphabet constant text := '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      entropy bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
      result text := '';
      position integer := 0;
    BEGIN
      -- UUID version/variant bytes are excluded; every character has six independent random bits.
      WHILE length(result) < 21 LOOP
        IF position NOT IN (6, 8, 22, 24) THEN
          result := result || substr(alphabet, (get_byte(entropy, position) & 63) + 1, 1);
        END IF;
        position := position + 1;
      END LOOP;
      RETURN result;
    END $function$;

    CREATE FUNCTION catalog_cache_stream_agency(stream_id bigint) RETURNS bigint LANGUAGE sql STABLE AS $function$
      SELECT profile.egcs_tp_agency FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" profile ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = stream_id
    $function$;

    CREATE FUNCTION catalog_cache_owners(table_name text, record jsonb) RETURNS SETOF bigint
    LANGUAGE plpgsql STABLE AS $function$
    BEGIN
      IF record IS NULL THEN RETURN; END IF;
      IF record ? 'egcs_ay_organizationagency' THEN
        RETURN NEXT (record->>'egcs_ay_organizationagency')::bigint;
      ELSIF record ? 'egcs_ay_agency' THEN
        RETURN NEXT (record->>'egcs_ay_agency')::bigint;
      ELSIF record ? 'egcs_cn_agency' THEN
        RETURN NEXT (record->>'egcs_cn_agency')::bigint;
      ELSIF record ? 'egcs_tp_transferpaymentstream' THEN
        RETURN NEXT catalog_cache_stream_agency((record->>'egcs_tp_transferpaymentstream')::bigint);
      ELSIF record ? 'egcs_tp_transferpaymentprofile' THEN
        RETURN QUERY SELECT egcs_tp_agency FROM "Transfer_Payment_Profile"
          WHERE id = (record->>'egcs_tp_transferpaymentprofile')::bigint;
      ELSIF table_name = 'Agency_Profile' THEN
        RETURN NEXT (record->>'id')::bigint;
      ELSIF table_name = 'Transfer_Payment_Profile' THEN
        RETURN NEXT (record->>'egcs_tp_agency')::bigint;
      ELSIF table_name = 'Agency_Cost_Category_Line_Item' THEN
        RETURN QUERY SELECT egcs_ay_organizationagency FROM "Agency_Cost_Category"
          WHERE id = (record->>'egcs_ay_organizationcostcategory')::bigint;
      ELSIF table_name = 'Agency_Custom_Field_Option' THEN
        RETURN QUERY SELECT egcs_ay_agency FROM "Agency_Custom_Field"
          WHERE id = (record->>'egcs_ay_field')::bigint;
      ELSIF table_name = 'Agency_Funding_Subtype' THEN
        RETURN QUERY SELECT egcs_ay_organizationagency FROM "Agency_Funding_Type"
          WHERE id = (record->>'egcs_ay_fundingtype')::bigint;
      ELSIF table_name = 'Transfer_Payment_Amendment_Subtype_Type' THEN
        RETURN QUERY SELECT catalog_cache_stream_agency(egcs_tp_transferpaymentstream)
          FROM "Transfer_Payment_Amendment_Subtype" WHERE id = (record->>'egcs_tp_amendmentsubtype')::bigint;
      ELSIF table_name = 'Common_Review_Setup' THEN
        RETURN QUERY SELECT egcs_cn_agency FROM "Common_Review_Set_Setup"
          WHERE id = (record->>'egcs_cn_reviewset')::bigint;
      ELSIF table_name IN ('Common_Publication', 'Common_Publication_Version') THEN
        IF record->>'egcs_cn_kind' = 'review_set_setup' THEN
          RETURN QUERY SELECT egcs_cn_agency FROM "Common_Review_Set_Setup"
            WHERE id = COALESCE(record->>'egcs_cn_publication', record->>'id')::bigint;
        ELSIF record->>'egcs_cn_kind' = 'review_schema' THEN
          RETURN QUERY SELECT egcs_cn_agency FROM "Common_Review_Schema"
            WHERE id = COALESCE(record->>'egcs_cn_publication', record->>'id')::bigint;
        END IF;
      ELSIF table_name = 'Common_Attachment' THEN
        RETURN QUERY SELECT egcs_ay_organizationagency FROM "Agency_Document_Template"
          WHERE egcs_ay_templateattachment_en = (record->>'id')::bigint
             OR egcs_ay_templateattachment_fr = (record->>'id')::bigint;
      END IF;

      -- Older Program transfers can leave these supported links across Agency boundaries.
      IF table_name = 'Agency_Agreement_Type' THEN
        RETURN QUERY SELECT catalog_cache_stream_agency(egcs_tp_transferpaymentstream)
          FROM "Transfer_Payment_Agreement_Subtype" WHERE egcs_tp_agreementtype = (record->>'id')::bigint;
      ELSIF table_name = 'Agency_Cost_Category_Line_Item' THEN
        RETURN QUERY SELECT catalog_cache_stream_agency(egcs_tp_transferpaymentstream)
          FROM "Transfer_Payment_Stream_Cost_Category_Line_Item"
          WHERE egcs_tp_organizationcostcategory = (record->>'id')::bigint;
      ELSIF table_name = 'Agency_Cost_Category' THEN
        RETURN QUERY SELECT catalog_cache_stream_agency(link.egcs_tp_transferpaymentstream)
          FROM "Transfer_Payment_Stream_Cost_Category_Line_Item" link
          JOIN "Agency_Cost_Category_Line_Item" item ON item.id = link.egcs_tp_organizationcostcategory
          WHERE item.egcs_ay_organizationcostcategory = (record->>'id')::bigint
             OR item.egcs_ay_sourcecategory = (record->>'id')::bigint;
      END IF;
    END $function$;

    CREATE FUNCTION invalidate_catalog_cache() RETURNS trigger LANGUAGE plpgsql AS $function$
    DECLARE
      previous jsonb;
      current jsonb;
      owner bigint;
      cataloggroup text;
      groups text[] := TG_ARGV;
    BEGIN
      IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
      IF TG_OP <> 'DELETE' THEN current := to_jsonb(NEW); END IF;
      IF previous IS NOT DISTINCT FROM current THEN RETURN NULL; END IF;
      IF groups[0] = '*' THEN groups := ${sql.raw(`ARRAY[${CATALOG_GROUPS.map(group => `'${group}'`).join(',')}]::text[]`)}; END IF;
      FOR owner IN SELECT DISTINCT agency FROM (
        SELECT catalog_cache_owners(TG_TABLE_NAME, previous) agency
        UNION ALL SELECT catalog_cache_owners(TG_TABLE_NAME, current) agency
      ) owners WHERE agency IS NOT NULL ORDER BY agency LOOP
        FOR cataloggroup IN SELECT DISTINCT value FROM unnest(groups) value ORDER BY value LOOP
          INSERT INTO "Agency_Catalog_Revision" (egcs_ay_agency, egcs_ay_cataloggroup, egcs_ay_revision)
          VALUES (owner, cataloggroup, catalog_cache_nanoid())
          ON CONFLICT (egcs_ay_agency, egcs_ay_cataloggroup)
          DO UPDATE SET egcs_ay_revision = excluded.egcs_ay_revision;
        END LOOP;
      END LOOP;
      RETURN NULL;
    END $function$;
    END $catalog$;
  `.execute(db)
}

/**
 * Covers supported catalog writes, including raw imports and relationship changes.
 * @param db - Fresh database with catalog revision functions installed.
 */
export const installCatalogCacheTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    DO $catalog$ BEGIN
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Profile" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('*');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Profile" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('*');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('*');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('chart-of-accounts');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Fiscal_Year" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('fiscal-years', 'chart-of-accounts');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Account_Receivable_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('receivable-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Address_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('address-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Document_Template" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('document-templates');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Cost_Category" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('cost-categories');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Cost_Category_Line_Item" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('cost-categories');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Commitment_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('commitment-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Funding_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('funding-subtypes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Funding_Subtype" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('funding-subtypes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Monitor_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('monitor-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Agreement_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('agreement-subtypes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Custom_Field" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('custom-fields');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Custom_Field_Option" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('custom-fields');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Holdback_Basis" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('holdback-bases');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Agency_Approval_Behalf_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('approval-behalf-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Outcome" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('outcomes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Chart_of_Account" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('chart-of-accounts');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Document_Template" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('document-templates');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Cost_Category_Line_Item" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('cost-categories');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Commitment_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('commitment-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Funding_Subtype" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('funding-subtypes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Monitor_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('monitor-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Holdback_Basis" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('holdback-bases');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Agreement_Subtype" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('agreement-subtypes');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Amendment_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('amendment-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Amendment_Subtype" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('amendment-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Amendment_Subtype_Type" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('amendment-types');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Field_Assignment" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('custom-fields');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Field_Section" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('custom-fields');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Stream_Review_Set" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Review_Set_Setup" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Review_Setup" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Review_Schema" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Publication" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Publication_Version" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('review-setups');
    CREATE TRIGGER catalog_cache_revision AFTER INSERT OR UPDATE OR DELETE ON "Common_Attachment" FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_cache('document-templates');
    END $catalog$;
  `.execute(db)
}
