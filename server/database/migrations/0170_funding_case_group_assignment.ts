import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Allows an imported Intake to wait in an Agency group before a user claims it. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Funding_Case_Intake_Profile"
    ADD COLUMN egcs_fi_group bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT,
    ADD COLUMN egcs_fi_groupclaimedby bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fi_chk_group_claim CHECK (egcs_fi_groupclaimedby IS NULL OR egcs_fi_group IS NOT NULL)`.execute(db)
  await sql`CREATE FUNCTION trg_fn_validate_intake_group_agency() RETURNS trigger AS $$
    DECLARE owner_agency bigint; group_agency bigint;
    BEGIN
      IF NEW.egcs_fi_group IS NULL THEN RETURN NEW; END IF;
      SELECT profile.egcs_tp_agency INTO owner_agency
      FROM "Funding_Opportunity_Profile" opportunity
      JOIN "Transfer_Payment_Stream" stream ON stream.id = opportunity.egcs_fo_transferpaymentstream
      JOIN "Transfer_Payment_Profile" profile ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE opportunity.id = NEW.egcs_fi_fundingopportunity;
      SELECT egcs_cn_agency INTO group_agency FROM "Common_Group"
      WHERE id = NEW.egcs_fi_group AND _deleted = false;
      IF owner_agency IS NULL OR group_agency IS NULL OR owner_agency <> group_agency THEN
        RAISE EXCEPTION 'Intake group must belong to the opportunity Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'fi_chk_group_agency';
      END IF;
      RETURN NEW;
    END;
  $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_validate_intake_group_agency
    AFTER INSERT OR UPDATE OF egcs_fi_group, egcs_fi_fundingopportunity ON "Funding_Case_Intake_Profile"
    DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_intake_group_agency()`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_group_aware_entity_assignment_roster(target_id bigint, target_type varchar) RETURNS void AS $$
    DECLARE active_count integer; primary_count integer; has_pending_group boolean;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary)
      INTO active_count, primary_count
      FROM "Common_Entity_Assignment"
      WHERE egcs_cn_entityid = target_id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF target_type = 'commonreview' THEN
        SELECT EXISTS (SELECT 1 FROM "Common_Review" review
          WHERE review.id = target_id AND review._deleted = false
            AND review.egcs_cn_group IS NOT NULL AND review.egcs_cn_groupclaimedby IS NULL)
        INTO has_pending_group;
      ELSIF target_type = 'fundingcaseintake' THEN
        SELECT EXISTS (SELECT 1 FROM "Funding_Case_Intake_Profile" intake
          WHERE intake.id = target_id AND intake._deleted = false
            AND intake.egcs_fi_group IS NOT NULL AND intake.egcs_fi_groupclaimedby IS NULL)
        INTO has_pending_group;
      END IF;
      IF active_count = 0 AND COALESCE(has_pending_group, false) THEN RETURN; END IF;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active entity assignment roster requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentroster';
      END IF;
    END;
    $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_intake_group_roster
    AFTER INSERT OR UPDATE OF egcs_fi_group, egcs_fi_groupclaimedby, _deleted ON "Funding_Case_Intake_Profile"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('fundingcaseintake')`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const grouped = await db.selectFrom('Funding_Case_Intake_Profile').select('id')
    .where('egcs_fi_group', 'is not', null).executeTakeFirst()
  if (grouped) throw new Error('Cannot remove Intake group assignments while group evidence exists.')
  await sql`DROP TRIGGER trg_enforce_intake_group_roster ON "Funding_Case_Intake_Profile"`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_group_aware_entity_assignment_roster(target_id bigint, target_type varchar) RETURNS void AS $$
    DECLARE active_count integer; primary_count integer; has_pending_group boolean;
    BEGIN
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary)
      INTO active_count, primary_count
      FROM "Common_Entity_Assignment"
      WHERE egcs_cn_entityid = target_id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF target_type = 'commonreview' THEN
        SELECT EXISTS (SELECT 1 FROM "Common_Review" review
          WHERE review.id = target_id AND review._deleted = false
            AND review.egcs_cn_group IS NOT NULL AND review.egcs_cn_groupclaimedby IS NULL)
        INTO has_pending_group;
      END IF;
      IF (active_count = 0 AND COALESCE(has_pending_group, false)) THEN RETURN; END IF;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active entity assignment roster requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentroster';
      END IF;
    END;
    $$ LANGUAGE plpgsql`.execute(db)
  await sql`DROP TRIGGER trg_validate_intake_group_agency ON "Funding_Case_Intake_Profile"`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_intake_group_agency()`.execute(db)
  await sql`ALTER TABLE "Funding_Case_Intake_Profile"
    DROP CONSTRAINT fi_chk_group_claim,
    DROP COLUMN egcs_fi_groupclaimedby,
    DROP COLUMN egcs_fi_group`.execute(db)
}
