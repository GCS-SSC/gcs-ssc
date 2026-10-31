import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/**
 * Installs retained Amendment catalog identity and selection guards in the Agreement baseline.
 * @param db Database being initialized.
 */
export const installAmendmentCatalogIntegrity = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE OR REPLACE FUNCTION guard_used_amendment_catalog() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE used boolean;
BEGIN
  IF TG_TABLE_NAME = 'Transfer_Payment_Amendment_Type' THEN
    SELECT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Amendment_Type" WHERE egcs_fc_amendmenttype = OLD.id) INTO used;
  ELSE
    SELECT EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Amendment_Subtype" WHERE egcs_fc_amendmentsubtype = OLD.id) INTO used;
  END IF;
  IF used AND (TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'egcs_tp_active') IS DISTINCT FROM (to_jsonb(OLD) - 'egcs_tp_active')) THEN
    RAISE EXCEPTION 'Amendment catalog definition is already in use' USING ERRCODE = '23514', CONSTRAINT = 'tp_amendment_catalog_in_use';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_used_amendment_type ON "Transfer_Payment_Amendment_Type";
CREATE TRIGGER guard_used_amendment_type BEFORE UPDATE OR DELETE ON "Transfer_Payment_Amendment_Type" FOR EACH ROW EXECUTE FUNCTION guard_used_amendment_catalog();
DROP TRIGGER IF EXISTS guard_used_amendment_subtype ON "Transfer_Payment_Amendment_Subtype";
CREATE TRIGGER guard_used_amendment_subtype BEFORE UPDATE OR DELETE ON "Transfer_Payment_Amendment_Subtype" FOR EACH ROW EXECUTE FUNCTION guard_used_amendment_catalog();

CREATE OR REPLACE FUNCTION guard_used_amendment_subtype_mapping() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE subtype_id bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.egcs_tp_amendmentsubtype IS DISTINCT FROM OLD.egcs_tp_amendmentsubtype THEN
    RAISE EXCEPTION 'Subtype mapping owner cannot change' USING ERRCODE = '23514', CONSTRAINT = 'tp_amendment_catalog_in_use';
  END IF;
  subtype_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.egcs_tp_amendmentsubtype ELSE OLD.egcs_tp_amendmentsubtype END;
  PERFORM 1 FROM "Transfer_Payment_Amendment_Subtype" WHERE id = subtype_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "Funding_Case_Agreement_Amendment_Subtype" WHERE egcs_fc_amendmentsubtype = subtype_id)
    AND (TG_OP <> 'UPDATE' OR NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Amendment subtype mapping is already in use' USING ERRCODE = '23514', CONSTRAINT = 'tp_amendment_catalog_in_use';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_used_amendment_subtype_mapping ON "Transfer_Payment_Amendment_Subtype_Type";
CREATE TRIGGER guard_used_amendment_subtype_mapping BEFORE INSERT OR UPDATE OR DELETE ON "Transfer_Payment_Amendment_Subtype_Type" FOR EACH ROW EXECUTE FUNCTION guard_used_amendment_subtype_mapping();

CREATE OR REPLACE FUNCTION guard_new_amendment_catalog_selection() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE selectable boolean;
BEGIN
  IF NEW._deleted THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NOT OLD._deleted THEN
    IF TG_TABLE_NAME = 'Funding_Case_Agreement_Amendment_Type' THEN
      IF NEW.egcs_fc_amendmenttype = OLD.egcs_fc_amendmenttype THEN RETURN NEW; END IF;
    ELSE
      IF NEW.egcs_fc_amendmentsubtype = OLD.egcs_fc_amendmentsubtype THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Funding_Case_Agreement_Amendment_Type' THEN
    SELECT egcs_tp_active AND NOT _deleted INTO selectable FROM "Transfer_Payment_Amendment_Type" WHERE id = NEW.egcs_fc_amendmenttype FOR SHARE;
  ELSE
    SELECT egcs_tp_active AND NOT _deleted INTO selectable FROM "Transfer_Payment_Amendment_Subtype" WHERE id = NEW.egcs_fc_amendmentsubtype FOR SHARE;
  END IF;
  IF selectable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Amendment catalog selection must be active' USING ERRCODE = '23514', CONSTRAINT = 'tp_amendment_selection_inactive';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_new_amendment_type_selection ON "Funding_Case_Agreement_Amendment_Type";
CREATE TRIGGER guard_new_amendment_type_selection BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Amendment_Type" FOR EACH ROW EXECUTE FUNCTION guard_new_amendment_catalog_selection();
DROP TRIGGER IF EXISTS guard_new_amendment_subtype_selection ON "Funding_Case_Agreement_Amendment_Subtype";
CREATE TRIGGER guard_new_amendment_subtype_selection BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Amendment_Subtype" FOR EACH ROW EXECUTE FUNCTION guard_new_amendment_catalog_selection();
END $baseline$`.execute(db)
}
