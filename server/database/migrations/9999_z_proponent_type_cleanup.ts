import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Finalize classification after the immutable demo seed, without assigning types. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  // Kysely runs pending migrations in one transaction. Flush the seed's deferred
  // foreign-key checks before altering a table with pending trigger events.
  await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(db)
  await sql`ALTER TABLE "Applicant_Recipient_Profile" DROP COLUMN egcs_ar_applicantrecipientsubtypes`.execute(db)
  await sql`CREATE FUNCTION validate_stream_proponent_types(stream_id bigint) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        WHERE s.id = stream_id AND NOT r._deleted AND NOT a._deleted
          AND r.egcs_fc_applicantrecipientsubtype IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM "Transfer_Payment_Stream_Eligible_Recipient" e
            JOIN "Agency_Applicant_Recipient_Subtype" t ON t.id = e.egcs_tp_applicantrecipientsubtype
            WHERE e.egcs_tp_transferpaymentstream = s.id
              AND t.id = r.egcs_fc_applicantrecipientsubtype
              AND t.egcs_ay_organizationagency = p.egcs_tp_agency AND NOT e._deleted AND NOT t._deleted
          )
      ) THEN
        RAISE EXCEPTION 'Ineligible agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_eligible';
      END IF;
    END $$`.execute(db)
  // Validate future choices against the latest eligible saved choice. Historical
  // differences never prevent enabling the setting or saving an unchanged link.
  await sql`CREATE FUNCTION validate_proponent_type_choice(stream_id bigint, proponent_id bigint, subtype_id bigint)
    RETURNS void LANGUAGE plpgsql AS $$
    DECLARE previous_type bigint;
    BEGIN
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      IF subtype_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM "Transfer_Payment_Stream" WHERE id = stream_id AND egcs_tp_requireconsistentproponenttype
      ) THEN RETURN; END IF;
      SELECT r.egcs_fc_applicantrecipientsubtype INTO previous_type
        FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        JOIN "Transfer_Payment_Stream" s ON s.id = a.egcs_fc_transferpaymentstream
        JOIN "Transfer_Payment_Profile" p ON p.id = s.egcs_tp_transferpaymentprofile
        JOIN "Agency_Applicant_Recipient_Subtype" t ON t.id = r.egcs_fc_applicantrecipientsubtype
        WHERE a.egcs_fc_transferpaymentstream = stream_id AND r.egcs_fc_applicantrecipient = proponent_id
          AND NOT a._deleted AND NOT r._deleted AND NOT t._deleted
          AND t.egcs_ay_organizationagency = p.egcs_tp_agency
          AND EXISTS (SELECT 1 FROM "Transfer_Payment_Stream_Eligible_Recipient" e
            WHERE e.egcs_tp_transferpaymentstream = stream_id AND e.egcs_tp_applicantrecipientsubtype = t.id AND NOT e._deleted)
        ORDER BY a.id DESC, r.id DESC LIMIT 1;
      IF previous_type IS NOT NULL AND previous_type <> subtype_id THEN
        RAISE EXCEPTION 'Conflicting agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_consistent';
      END IF;
    END $$`.execute(db)
  await sql`CREATE FUNCTION guard_future_proponent_type() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE stream_id bigint; relationship record;
    BEGIN
      IF NEW._deleted THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
        IF NEW.egcs_fc_transferpaymentstream IS NOT DISTINCT FROM OLD.egcs_fc_transferpaymentstream AND NOT OLD._deleted THEN RETURN NEW; END IF;
        FOR relationship IN SELECT egcs_fc_applicantrecipient, egcs_fc_applicantrecipientsubtype
          FROM "Funding_Case_Agreement_Applicant_Recipient" WHERE egcs_fc_fundingagreement = NEW.id AND NOT _deleted ORDER BY id LOOP
          PERFORM validate_proponent_type_choice(NEW.egcs_fc_transferpaymentstream, relationship.egcs_fc_applicantrecipient, relationship.egcs_fc_applicantrecipientsubtype);
        END LOOP;
      ELSE
        IF TG_OP = 'UPDATE' AND NOT OLD._deleted
          AND NEW.egcs_fc_applicantrecipientsubtype IS NOT DISTINCT FROM OLD.egcs_fc_applicantrecipientsubtype
          AND NEW.egcs_fc_applicantrecipient = OLD.egcs_fc_applicantrecipient
          AND NEW.egcs_fc_fundingagreement = OLD.egcs_fc_fundingagreement THEN RETURN NEW; END IF;
        SELECT egcs_fc_transferpaymentstream INTO stream_id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement;
        PERFORM validate_proponent_type_choice(stream_id, NEW.egcs_fc_applicantrecipient, NEW.egcs_fc_applicantrecipientsubtype);
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER guard_future_proponent_type BEFORE INSERT OR UPDATE ON "Funding_Case_Agreement_Applicant_Recipient"
    FOR EACH ROW EXECUTE FUNCTION guard_future_proponent_type()`.execute(db)
  await sql`CREATE TRIGGER guard_future_agreement_proponent_types BEFORE UPDATE OF egcs_fc_transferpaymentstream, _deleted ON "Funding_Case_Agreement_Profile"
    FOR EACH ROW EXECUTE FUNCTION guard_future_proponent_type()`.execute(db)
  await sql`CREATE FUNCTION guard_agreement_proponent_type() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE stream_id bigint;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.egcs_fc_applicantrecipientsubtype IS NOT NULL AND NEW.egcs_fc_applicantrecipientsubtype IS NULL THEN
        RAISE EXCEPTION 'Cannot clear agreement proponent type' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_required';
      END IF;
      IF NEW.egcs_fc_applicantrecipientsubtype IS NULL AND (TG_OP = 'INSERT' OR NOT NEW._deleted) THEN
        RAISE EXCEPTION 'Agreement proponent type required' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_required';
      END IF;
      SELECT egcs_fc_transferpaymentstream INTO stream_id FROM "Funding_Case_Agreement_Profile" WHERE id = NEW.egcs_fc_fundingagreement;
      PERFORM id FROM "Transfer_Payment_Stream" WHERE id = stream_id FOR UPDATE;
      -- A foreign-key KEY SHARE lock alone does not serialize soft retirement.
      PERFORM id FROM "Agency_Applicant_Recipient_Subtype"
        WHERE id = NEW.egcs_fc_applicantrecipientsubtype FOR SHARE;
      PERFORM validate_stream_proponent_types(stream_id);
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER guard_agreement_proponent_type AFTER INSERT OR UPDATE ON "Funding_Case_Agreement_Applicant_Recipient"
      FOR EACH ROW EXECUTE FUNCTION guard_agreement_proponent_type()`.execute(db)
  await sql`CREATE FUNCTION guard_stream_proponent_types() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE stream_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Transfer_Payment_Stream' THEN
        PERFORM validate_stream_proponent_types(NEW.id);
      ELSIF TG_TABLE_NAME = 'Transfer_Payment_Profile' THEN
        FOR stream_id IN SELECT id FROM "Transfer_Payment_Stream" WHERE egcs_tp_transferpaymentprofile = NEW.id ORDER BY id LOOP
          PERFORM validate_stream_proponent_types(stream_id);
        END LOOP;
      ELSIF TG_TABLE_NAME = 'Funding_Case_Agreement_Profile' THEN
        PERFORM validate_stream_proponent_types(NEW.egcs_fc_transferpaymentstream);
      ELSE
        PERFORM validate_stream_proponent_types(OLD.egcs_tp_transferpaymentstream);
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER guard_stream_proponent_types AFTER UPDATE OF egcs_tp_requireconsistentproponenttype, egcs_tp_transferpaymentprofile ON "Transfer_Payment_Stream"
      FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types()`.execute(db)
  await sql`CREATE TRIGGER guard_program_proponent_types AFTER UPDATE OF egcs_tp_agency ON "Transfer_Payment_Profile"
      FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types()`.execute(db)
  await sql`CREATE TRIGGER guard_agreement_stream_proponent_types AFTER UPDATE OF egcs_fc_transferpaymentstream, _deleted ON "Funding_Case_Agreement_Profile"
      FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types()`.execute(db)
  await sql`CREATE TRIGGER guard_eligible_proponent_types AFTER UPDATE OR DELETE ON "Transfer_Payment_Stream_Eligible_Recipient"
      FOR EACH ROW EXECUTE FUNCTION guard_stream_proponent_types()`.execute(db)
  await sql`CREATE FUNCTION guard_referenced_proponent_subtype() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW._deleted OR NEW.egcs_ay_organizationagency IS DISTINCT FROM OLD.egcs_ay_organizationagency) AND EXISTS (
        SELECT 1 FROM "Funding_Case_Agreement_Applicant_Recipient" r
        JOIN "Funding_Case_Agreement_Profile" a ON a.id = r.egcs_fc_fundingagreement
        WHERE r.egcs_fc_applicantrecipientsubtype = OLD.id AND NOT r._deleted AND NOT a._deleted
      ) THEN
        RAISE EXCEPTION 'Agreement proponent type in use' USING ERRCODE = '23514', CONSTRAINT = 'agreement_proponent_type_eligible';
      END IF;
      RETURN NEW;
    END $$`.execute(db)
  await sql`CREATE TRIGGER guard_referenced_proponent_subtype BEFORE UPDATE ON "Agency_Applicant_Recipient_Subtype"
      FOR EACH ROW EXECUTE FUNCTION guard_referenced_proponent_subtype()`.execute(db)
}

/** Relationship classifications cannot be folded back into one profile value. */
export const down = async (_db: Kysely<Database>): Promise<void> => {
  throw new Error('9999_z_proponent_type_cleanup is forward-only; restore a pre-release backup to roll back')
}
