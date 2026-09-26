import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'

/** Preserves the original anchor Stream while allowing other Streams in its Program. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "Funding_Opportunity_Stream" (
    id bigserial PRIMARY KEY,
    egcs_fo_fundingopportunity bigint NOT NULL REFERENCES "Funding_Opportunity_Profile"(id) ON DELETE RESTRICT,
    egcs_fo_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
    _deleted boolean NOT NULL DEFAULT false
  )`.execute(db)
  await sql`CREATE UNIQUE INDEX fo_idx_opportunity_stream_active
    ON "Funding_Opportunity_Stream" (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
    WHERE _deleted = false`.execute(db)
  await sql`CREATE INDEX fo_idx_opportunity_stream_stream_active
    ON "Funding_Opportunity_Stream" (egcs_fo_transferpaymentstream)
    WHERE _deleted = false`.execute(db)

  // Include soft-deleted Opportunities: their original Stream remains ownership evidence.
  await sql`INSERT INTO "Funding_Opportunity_Stream" (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
    SELECT id, egcs_fo_transferpaymentstream FROM "Funding_Opportunity_Profile"`.execute(db)

  await sql`CREATE FUNCTION trg_fn_link_opportunity_anchor_stream() RETURNS trigger AS $$
    BEGIN
      INSERT INTO "Funding_Opportunity_Stream" (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
      VALUES (NEW.id, NEW.egcs_fo_transferpaymentstream)
      ON CONFLICT (egcs_fo_fundingopportunity, egcs_fo_transferpaymentstream)
        WHERE _deleted = false DO NOTHING;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE TRIGGER trg_link_opportunity_anchor_stream
    AFTER INSERT OR UPDATE OF egcs_fo_transferpaymentstream ON "Funding_Opportunity_Profile"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_link_opportunity_anchor_stream()`.execute(db)

  await sql`CREATE FUNCTION trg_fn_assert_opportunity_streams(opportunity_id bigint) RETURNS void AS $$
    DECLARE anchor_stream bigint; anchor_program bigint;
      opportunity_name_en text; opportunity_name_fr text; opportunity_deleted boolean;
    BEGIN
      SELECT opportunity.egcs_fo_transferpaymentstream, stream.egcs_tp_transferpaymentprofile,
          opportunity.egcs_fo_name_en, opportunity.egcs_fo_name_fr, opportunity._deleted
        INTO anchor_stream, anchor_program, opportunity_name_en, opportunity_name_fr, opportunity_deleted
      FROM "Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream
      WHERE opportunity.id = opportunity_id FOR UPDATE OF opportunity;
      IF NOT FOUND THEN RETURN; END IF;
      -- Serializes concurrent selection/name checks across this Program.
      PERFORM 1 FROM "Transfer_Payment_Profile" WHERE id = anchor_program FOR UPDATE;
      IF NOT EXISTS (SELECT 1 FROM "Funding_Opportunity_Stream" link
        WHERE link.egcs_fo_fundingopportunity = opportunity_id
          AND link.egcs_fo_transferpaymentstream = anchor_stream AND link._deleted = false) THEN
        RAISE EXCEPTION 'Opportunity must retain its anchor Stream'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_anchor_stream';
      END IF;
      IF EXISTS (SELECT 1 FROM "Funding_Opportunity_Stream" link
        JOIN "Transfer_Payment_Stream" stream ON stream.id = link.egcs_fo_transferpaymentstream
        WHERE link.egcs_fo_fundingopportunity = opportunity_id AND link._deleted = false
          AND stream.egcs_tp_transferpaymentprofile <> anchor_program) THEN
        RAISE EXCEPTION 'Opportunity Streams must belong to one Program'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_stream_program';
      END IF;
      IF NOT opportunity_deleted AND EXISTS (
        SELECT 1 FROM "Funding_Opportunity_Profile" other
        WHERE other.id <> opportunity_id AND other._deleted = false
          AND lower(btrim(other.egcs_fo_name_en)) = lower(btrim(opportunity_name_en))
          AND EXISTS (
            SELECT 1 FROM "Funding_Opportunity_Stream" selected
            JOIN "Funding_Opportunity_Stream" other_selected
              ON other_selected.egcs_fo_transferpaymentstream = selected.egcs_fo_transferpaymentstream
              AND other_selected.egcs_fo_fundingopportunity = other.id AND other_selected._deleted = false
            WHERE selected.egcs_fo_fundingopportunity = opportunity_id AND selected._deleted = false
          )
      ) THEN
        RAISE EXCEPTION 'Opportunity English name must be unique in each selected Stream'
          USING ERRCODE = '23505', CONSTRAINT = 'fo_idx_selected_stream_name_en';
      END IF;
      IF NOT opportunity_deleted AND EXISTS (
        SELECT 1 FROM "Funding_Opportunity_Profile" other
        WHERE other.id <> opportunity_id AND other._deleted = false
          AND lower(btrim(other.egcs_fo_name_fr)) = lower(btrim(opportunity_name_fr))
          AND EXISTS (
            SELECT 1 FROM "Funding_Opportunity_Stream" selected
            JOIN "Funding_Opportunity_Stream" other_selected
              ON other_selected.egcs_fo_transferpaymentstream = selected.egcs_fo_transferpaymentstream
              AND other_selected.egcs_fo_fundingopportunity = other.id AND other_selected._deleted = false
            WHERE selected.egcs_fo_fundingopportunity = opportunity_id AND selected._deleted = false
          )
      ) THEN
        RAISE EXCEPTION 'Opportunity French name must be unique in each selected Stream'
          USING ERRCODE = '23505', CONSTRAINT = 'fo_idx_selected_stream_name_fr';
      END IF;
    END;
  $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_opportunity_stream_links() RETURNS trigger AS $$
    DECLARE opportunity_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Funding_Opportunity_Profile' THEN
        PERFORM trg_fn_assert_opportunity_streams(NEW.id);
      ELSIF TG_TABLE_NAME = 'Funding_Opportunity_Stream' THEN
        IF TG_OP <> 'INSERT' THEN PERFORM trg_fn_assert_opportunity_streams(OLD.egcs_fo_fundingopportunity); END IF;
        IF TG_OP <> 'DELETE' THEN PERFORM trg_fn_assert_opportunity_streams(NEW.egcs_fo_fundingopportunity); END IF;
      ELSE
        FOR opportunity_id IN
          SELECT DISTINCT link.egcs_fo_fundingopportunity
          FROM "Funding_Opportunity_Stream" link
          WHERE link.egcs_fo_transferpaymentstream = NEW.id AND link._deleted = false
        LOOP
          PERFORM trg_fn_assert_opportunity_streams(opportunity_id);
        END LOOP;
      END IF;
      RETURN NULL;
    END;
  $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_profile
    AFTER INSERT OR UPDATE OF egcs_fo_transferpaymentstream, egcs_fo_name_en, egcs_fo_name_fr, _deleted ON "Funding_Opportunity_Profile"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links()`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_link
    AFTER INSERT OR UPDATE OR DELETE ON "Funding_Opportunity_Stream"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links()`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_opportunity_streams_stream
    AFTER UPDATE OF egcs_tp_transferpaymentprofile ON "Transfer_Payment_Stream"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_validate_opportunity_stream_links()`.execute(db)

  // A deployed global Root Administrator predating Intakes has no funding_case row.
  // Existing active permissions, including deliberately narrower ones, are untouched.
  await sql`INSERT INTO role_permission (role_id, subject, access_level, can_manage_assignments, _deleted)
    SELECT role.id, 'funding_case', 'manager', true, false FROM role
    WHERE role.agency_id IS NULL AND role.name_en = 'Root Administrator' AND role._deleted = false
      AND NOT EXISTS (SELECT 1 FROM role_permission permission
        WHERE permission.role_id = role.id AND permission.subject = 'funding_case' AND permission._deleted = false)`.execute(db)

  await installAuditOwnershipFunctions(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const additionalStream = await db.selectFrom('Funding_Opportunity_Stream as link')
    .innerJoin('Funding_Opportunity_Profile as opportunity', 'opportunity.id', 'link.egcs_fo_fundingopportunity')
    .select('link.id')
    .whereRef('link.egcs_fo_transferpaymentstream', '!=', 'opportunity.egcs_fo_transferpaymentstream')
    .executeTakeFirst()
  if (additionalStream) throw new Error('Cannot remove Opportunity Stream links while multi-Stream evidence exists.')

  await sql`DROP TRIGGER trg_validate_opportunity_streams_stream ON "Transfer_Payment_Stream"`.execute(db)
  await sql`DROP TRIGGER trg_validate_opportunity_streams_link ON "Funding_Opportunity_Stream"`.execute(db)
  await sql`DROP TRIGGER trg_validate_opportunity_streams_profile ON "Funding_Opportunity_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_opportunity_stream_links()`.execute(db)
  await sql`DROP FUNCTION trg_fn_assert_opportunity_streams(bigint)`.execute(db)
  await sql`DROP TRIGGER trg_link_opportunity_anchor_stream ON "Funding_Opportunity_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_link_opportunity_anchor_stream()`.execute(db)
  await sql`DROP TABLE "Funding_Opportunity_Stream"`.execute(db)

  const previousRegistry = { ...AUDIT_TABLE_OWNERSHIP }
  delete previousRegistry['public.Funding_Opportunity_Stream']
  await installAuditOwnershipFunctions(db, previousRegistry)
  // Role grants can be changed after upgrade; rollback never removes them.
}
