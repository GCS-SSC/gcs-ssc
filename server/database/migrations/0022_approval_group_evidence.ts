import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Keeps group evidence policy with the published step and each materialized approval. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Common_Approval_Step" ADD COLUMN egcs_cn_requiregroupdetails boolean NOT NULL DEFAULT false`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD COLUMN egcs_cn_requiregroupdetails boolean NOT NULL DEFAULT false`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP CONSTRAINT cn_chk_approval_onbehalf`.execute(db)
  // A claimant is unknown while an approval is assigned to a group. The decision
  // transaction validates on-behalf against the actor and the default assignee.
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approval_onbehalf CHECK (
    egcs_cn_onbehalf IS NULL OR egcs_cn_defaultuser IS NOT NULL OR egcs_cn_defaultgroup IS NOT NULL
  )`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_autopopulate_self_approval() RETURNS trigger AS $$
    DECLARE user_position_title text;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_cn_defaultuser IS NULL OR NEW.egcs_cn_defaultuser <> NEW.egcs_cn_assigneduser THEN RETURN NEW; END IF;
      SELECT egcs_cn_position_title INTO user_position_title FROM "Common_User" WHERE id = NEW.egcs_cn_assigneduser;
      NEW.egcs_cn_approvaldate := NOW();
      NEW.egcs_cn_approvalpositiontitle := user_position_title;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE FUNCTION trg_fn_validate_claimant_approval_evidence() RETURNS trigger AS $$
    DECLARE matches_default boolean;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_cn_assigneduser IS NULL THEN
        RAISE EXCEPTION 'Approval % requires a claimant before a decision', NEW.id;
      END IF;
      IF NEW.egcs_cn_defaultuser IS NOT NULL THEN
        matches_default := NEW.egcs_cn_assigneduser = NEW.egcs_cn_defaultuser;
      ELSIF NEW.egcs_cn_defaultgroup IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM "Common_Group_Member" member
          JOIN "Common_Group" grp ON grp.id = member.egcs_cn_group
          JOIN "Common_User" actor ON actor.id = member.egcs_cn_user
          JOIN "user" auth_user ON auth_user.id = actor.egcs_cn_auth_user_id
          WHERE member.egcs_cn_group = NEW.egcs_cn_defaultgroup
            AND member.egcs_cn_user = NEW.egcs_cn_assigneduser
            AND member._deleted = false AND grp._deleted = false
            AND actor._deleted = false AND auth_user._deleted = false
        ) INTO matches_default;
      ELSE
        matches_default := true;
      END IF;
      IF matches_default AND NEW.egcs_cn_onbehalf IS NOT NULL THEN
        RAISE EXCEPTION 'Approval % does not permit on-behalf evidence for its default claimant', NEW.id;
      END IF;
      IF NOT matches_default AND NEW.egcs_cn_onbehalf IS NULL THEN
        RAISE EXCEPTION 'Approval % requires on-behalf evidence for its claimant', NEW.id;
      END IF;
      IF NEW.egcs_cn_defaultgroup IS NOT NULL AND matches_default AND NEW.egcs_cn_requiregroupdetails
        AND (NULLIF(BTRIM(NEW.egcs_cn_approvalpositiontitle), '') IS NULL OR NEW.egcs_cn_approvaldate IS NULL) THEN
        RAISE EXCEPTION 'Approval % requires group claimant title and date', NEW.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_claimant_approval_evidence BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_claimant_approval_evidence()`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const incompatible = await sql<{ used: boolean }>`SELECT (EXISTS (
    SELECT 1 FROM "Common_Approval" WHERE
      egcs_cn_requiregroupdetails = true
      OR
      (egcs_cn_defaultuser IS NULL AND egcs_cn_onbehalf IS NOT NULL)
      OR (egcs_cn_defaultuser IS NOT NULL AND egcs_cn_assigneduser = egcs_cn_defaultuser
        AND egcs_cn_assignedgroup IS NULL AND egcs_cn_onbehalf IS NOT NULL)
      OR (egcs_cn_defaultuser IS NOT NULL
        AND (egcs_cn_assigneduser IS DISTINCT FROM egcs_cn_defaultuser OR egcs_cn_assignedgroup IS NOT NULL)
        AND egcs_cn_onbehalf IS NULL)
  ) OR EXISTS (SELECT 1 FROM "Common_Approval_Step" WHERE egcs_cn_requiregroupdetails = true)) AS used`.execute(db)
  if (incompatible.rows[0]?.used) throw new Error('Approval evidence uses claimant-time on-behalf rules and cannot be rolled back safely.')
  await sql`DROP TRIGGER IF EXISTS trg_validate_claimant_approval_evidence ON "Common_Approval"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_claimant_approval_evidence()`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP CONSTRAINT cn_chk_approval_onbehalf`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approval_onbehalf CHECK (
    (egcs_cn_defaultuser IS NULL AND egcs_cn_onbehalf IS NULL)
    OR (egcs_cn_defaultuser IS NOT NULL AND (
      (egcs_cn_assigneduser = egcs_cn_defaultuser AND egcs_cn_assignedgroup IS NULL AND egcs_cn_onbehalf IS NULL)
      OR ((egcs_cn_assigneduser IS DISTINCT FROM egcs_cn_defaultuser OR egcs_cn_assignedgroup IS NOT NULL) AND egcs_cn_onbehalf IS NOT NULL)
    ))
  )`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP COLUMN egcs_cn_requiregroupdetails`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Step" DROP COLUMN egcs_cn_requiregroupdetails`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_autopopulate_self_approval() RETURNS trigger AS $$
    DECLARE user_position_title text;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN RETURN NEW; END IF;
      IF NEW.egcs_cn_defaultuser <> NEW.egcs_cn_assigneduser THEN RETURN NEW; END IF;
      SELECT egcs_cn_position_title INTO user_position_title FROM "Common_User" WHERE id = NEW.egcs_cn_assigneduser;
      NEW.egcs_cn_approvaldate := NOW();
      NEW.egcs_cn_approvalpositiontitle := user_position_title;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
}
