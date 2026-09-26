import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Replaces Opportunity lifecycle labels with the owning Agency's status definitions. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Funding_Opportunity_Profile" ADD COLUMN egcs_fo_status_new bigint`.execute(db)
  await sql`
    DO $$
    DECLARE opportunity record; agency_id bigint; selected_status bigint; candidates bigint[];
    BEGIN
      FOR opportunity IN SELECT id, egcs_fo_transferpaymentstream, egcs_fo_status
        FROM "Funding_Opportunity_Profile" LOOP
        SELECT program.egcs_tp_agency INTO agency_id
        FROM "Transfer_Payment_Stream" stream
        JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
        WHERE stream.id = opportunity.egcs_fo_transferpaymentstream;
        IF agency_id IS NULL THEN
          RAISE EXCEPTION 'Opportunity % has no owning Agency', opportunity.id;
        END IF;

        selected_status := NULL;
        IF opportunity.egcs_fo_status = 'draft' THEN
          SELECT id INTO selected_status FROM "Common_Status"
          WHERE egcs_cn_agency = agency_id AND egcs_cn_isdraft = true AND _deleted = false;
        ELSIF opportunity.egcs_fo_status = 'open' THEN
          SELECT id INTO selected_status FROM "Common_Status"
          WHERE egcs_cn_agency = agency_id AND lower(btrim(egcs_cn_name_en)) = 'active'
            AND egcs_cn_isdraft = false AND egcs_cn_readonly = false
            AND egcs_cn_terminal = false AND _deleted = false;
          IF selected_status IS NULL THEN
            SELECT array_agg(id ORDER BY id) INTO candidates FROM "Common_Status"
            WHERE egcs_cn_agency = agency_id AND egcs_cn_isdraft = false
              AND egcs_cn_readonly = false AND egcs_cn_terminal = false AND _deleted = false;
            IF array_length(candidates, 1) = 1 THEN selected_status := candidates[1]; END IF;
          END IF;
        ELSIF opportunity.egcs_fo_status = 'closed' THEN
          SELECT id INTO selected_status FROM "Common_Status"
          WHERE egcs_cn_agency = agency_id AND lower(btrim(egcs_cn_name_en)) = 'closed'
            AND (egcs_cn_readonly = true OR egcs_cn_terminal = true) AND _deleted = false;
          IF selected_status IS NULL THEN
            SELECT id INTO selected_status FROM "Common_Status"
            WHERE egcs_cn_agency = agency_id AND lower(btrim(egcs_cn_name_en)) = 'inactive'
              AND (egcs_cn_readonly = true OR egcs_cn_terminal = true) AND _deleted = false;
          END IF;
          IF selected_status IS NULL THEN
            SELECT array_agg(id ORDER BY id) INTO candidates FROM "Common_Status"
            WHERE egcs_cn_agency = agency_id
              AND (egcs_cn_readonly = true OR egcs_cn_terminal = true) AND _deleted = false;
            IF array_length(candidates, 1) = 1 THEN selected_status := candidates[1]; END IF;
          END IF;
        END IF;
        IF selected_status IS NULL THEN
          RAISE EXCEPTION 'Opportunity % legacy status % has no unambiguous Agency % mapping',
            opportunity.id, opportunity.egcs_fo_status, agency_id;
        END IF;
        UPDATE "Funding_Opportunity_Profile" SET egcs_fo_status_new = selected_status
        WHERE id = opportunity.id;
      END LOOP;
    END $$
  `.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" DROP CONSTRAINT fo_chk_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" DROP COLUMN egcs_fo_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" RENAME COLUMN egcs_fo_status_new TO egcs_fo_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" ALTER COLUMN egcs_fo_status SET NOT NULL`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" ADD CONSTRAINT fo_fk_status
    FOREIGN KEY (egcs_fo_status) REFERENCES "Common_Status"(id) ON DELETE RESTRICT`.execute(db)
  await sql`
    CREATE FUNCTION trg_fn_validate_opportunity_status_agency() RETURNS trigger AS $$
    DECLARE owner_agency bigint; status_agency bigint;
    BEGIN
      SELECT program.egcs_tp_agency INTO owner_agency
      FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" program ON program.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = NEW.egcs_fo_transferpaymentstream;
      SELECT egcs_cn_agency INTO status_agency FROM "Common_Status"
      WHERE id = NEW.egcs_fo_status AND _deleted = false;
      IF owner_agency IS NULL OR status_agency IS NULL OR owner_agency <> status_agency THEN
        RAISE EXCEPTION 'Opportunity status must belong to its Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fo_chk_status_agency';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_opportunity_status_agency
    AFTER INSERT OR UPDATE OF egcs_fo_status, egcs_fo_transferpaymentstream
    ON "Funding_Opportunity_Profile" DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_opportunity_status_agency()`.execute(db)
}

/** Restores the old Draft-only schema only when doing so cannot discard Agency state. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const nonDraft = await sql<{ id: string }>`SELECT opportunity.id FROM "Funding_Opportunity_Profile" opportunity
    JOIN "Common_Status" status ON status.id = opportunity.egcs_fo_status
    WHERE status.egcs_cn_isdraft = false LIMIT 1`.execute(db)
  if (nonDraft.rows.length) throw new Error('Cannot roll back Agency Opportunity statuses while non-Draft Opportunity evidence exists')
  await sql`DROP TRIGGER trg_validate_opportunity_status_agency ON "Funding_Opportunity_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_opportunity_status_agency()`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" DROP CONSTRAINT fo_fk_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" ADD COLUMN egcs_fo_status_old varchar(16) NOT NULL DEFAULT 'draft'`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" DROP COLUMN egcs_fo_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" RENAME COLUMN egcs_fo_status_old TO egcs_fo_status`.execute(db)
  await sql`ALTER TABLE "Funding_Opportunity_Profile" ADD CONSTRAINT fo_chk_status
    CHECK (egcs_fo_status IN ('draft', 'open', 'closed'))`.execute(db)
}
