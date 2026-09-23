import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Adds non-login agency groups and claimable workflow targets without changing retained users. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    CREATE TABLE "Common_Group" (
      id bigserial PRIMARY KEY,
      egcs_cn_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
      egcs_cn_name_en text NOT NULL,
      egcs_cn_name_fr text NOT NULL,
      egcs_cn_email citext NOT NULL,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX cn_idx_group_active_email ON "Common_Group" (egcs_cn_email) WHERE _deleted = false`.execute(db)
  await sql`
    CREATE TABLE "Common_Group_Member" (
      id bigserial PRIMARY KEY,
      egcs_cn_group bigint NOT NULL REFERENCES "Common_Group"(id) ON DELETE RESTRICT,
      egcs_cn_user bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX cn_idx_group_member_active ON "Common_Group_Member" (egcs_cn_group, egcs_cn_user) WHERE _deleted = false`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit', 'system', 'agency', 'transfer_payment', 'role', 'user', 'group', 'agreement', 'applicant_recipient'))`.execute(db)
  await sql`INSERT INTO role_permission (role_id, subject, access_level, can_manage_assignments, _deleted)
    SELECT role_id, 'group', access_level, false, false FROM role_permission
    WHERE subject = 'user' AND _deleted = false AND access_level IS NOT NULL`.execute(db)

  await sql`ALTER TABLE "Common_Approval_Step" ADD COLUMN egcs_cn_defaultgroup bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Step" ALTER COLUMN egcs_cn_defaultuser DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Step" ADD CONSTRAINT cn_chk_approvalstep_assignee CHECK ((egcs_cn_defaultuser IS NOT NULL)::integer + (egcs_cn_defaultgroup IS NOT NULL)::integer = 1)`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD COLUMN egcs_cn_defaultgroup bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD COLUMN egcs_cn_assignedgroup bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ALTER COLUMN egcs_cn_defaultuser DROP NOT NULL`.execute(db)
  await sql`UPDATE "Common_Approval" SET egcs_cn_assigneduser = egcs_cn_defaultuser WHERE egcs_cn_assigneduser IS NULL`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approval_default_assignee CHECK ((egcs_cn_defaultuser IS NOT NULL)::integer + (egcs_cn_defaultgroup IS NOT NULL)::integer = 1)`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approval_current_assignee CHECK (egcs_cn_assigneduser IS NOT NULL OR egcs_cn_assignedgroup IS NOT NULL)`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP CONSTRAINT cn_chk_approvaldefaultuserassigneduseronbehalfnull`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP CONSTRAINT cn_chk_approvalassigneduseronbehalfapprovalpositiontitlenotnull`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approval_onbehalf CHECK (
    egcs_cn_onbehalf IS NULL OR egcs_cn_defaultuser IS NOT NULL OR egcs_cn_defaultgroup IS NOT NULL
  )`.execute(db)

  await sql`ALTER TABLE "Common_Additional_Reviewers" ADD COLUMN egcs_cn_group bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Additional_Reviewers" ALTER COLUMN egcs_cn_user DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE "Common_Additional_Reviewers" ADD CONSTRAINT cn_chk_additional_reviewer_assignee CHECK (egcs_cn_user IS NOT NULL OR egcs_cn_group IS NOT NULL)`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_reset_additional_reviewer_completion() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND (NEW.egcs_cn_user IS DISTINCT FROM OLD.egcs_cn_user
        OR NEW.egcs_cn_group IS DISTINCT FROM OLD.egcs_cn_group) THEN
        NEW.egcs_cn_completedat := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)

  await sql`ALTER TABLE "Common_Review_Setup" ADD COLUMN egcs_cn_defaultgroup bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Review" ADD COLUMN egcs_cn_group bigint REFERENCES "Common_Group"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Review" ADD COLUMN egcs_cn_groupclaimedby bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Review" ADD CONSTRAINT cn_chk_review_group_claim CHECK (egcs_cn_groupclaimedby IS NULL OR egcs_cn_group IS NOT NULL)`.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_group_aware_entity_assignment_roster(target_id bigint, target_type varchar) RETURNS void AS $$
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
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_entity_assignment_roster() RETURNS trigger AS $$
    DECLARE target_id bigint; target_type varchar(128); target_deleted boolean;
    BEGIN
      target_id := COALESCE(NEW.egcs_cn_entityid, OLD.egcs_cn_entityid);
      target_type := COALESCE(NEW.egcs_cn_entitytype, OLD.egcs_cn_entitytype);
      SELECT _deleted INTO target_deleted FROM "Common_Entity"
        WHERE id = target_id AND egcs_cn_entitytype = target_type;
      IF COALESCE(target_deleted, true) THEN RETURN NULL; END IF;
      PERFORM trg_fn_group_aware_entity_assignment_roster(target_id, target_type);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_assignable_entity_roster() RETURNS trigger AS $$
    BEGIN
      IF NEW._deleted = true THEN RETURN NULL; END IF;
      PERFORM trg_fn_group_aware_entity_assignment_roster(NEW.id, TG_ARGV[0]::varchar);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE CONSTRAINT TRIGGER trg_enforce_review_group_roster AFTER INSERT OR UPDATE OF egcs_cn_group, egcs_cn_groupclaimedby, _deleted ON "Common_Review" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonreview')`.execute(db)
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
        AND (NULLIF(BTRIM(NEW.egcs_cn_approvername), '') IS NULL
          OR NULLIF(BTRIM(NEW.egcs_cn_approvalpositiontitle), '') IS NULL
          OR NEW.egcs_cn_approvaldate IS NULL) THEN
        RAISE EXCEPTION 'Approval % requires group claimant name, title and date', NEW.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_claimant_approval_evidence BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_claimant_approval_evidence()`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  const inUse = await sql<{ used: boolean }>`SELECT (
    EXISTS (SELECT 1 FROM "Common_Group")
    OR EXISTS (SELECT 1 FROM "Common_Group_Member")
    OR EXISTS (SELECT 1 FROM "Common_Approval_Step" WHERE egcs_cn_defaultgroup IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Common_Approval" WHERE egcs_cn_defaultgroup IS NOT NULL OR egcs_cn_assignedgroup IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Common_Additional_Reviewers" WHERE egcs_cn_group IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Common_Review_Setup" WHERE egcs_cn_defaultgroup IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "Common_Review" WHERE egcs_cn_group IS NOT NULL)
  ) AS used`.execute(db)
  if (inUse.rows[0]?.used) throw new Error('Administrative groups contain retained data and cannot be rolled back without explicit reassignment.')
  await sql`DROP TRIGGER IF EXISTS trg_validate_claimant_approval_evidence ON "Common_Approval"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_claimant_approval_evidence()`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_review_group_roster ON "Common_Review"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_group_aware_entity_assignment_roster(bigint, varchar)`.execute(db)
  await sql`ALTER TABLE "Common_Review" DROP COLUMN egcs_cn_groupclaimedby, DROP COLUMN egcs_cn_group`.execute(db)
  await sql`ALTER TABLE "Common_Review_Setup" DROP COLUMN egcs_cn_defaultgroup`.execute(db)
  await sql`ALTER TABLE "Common_Additional_Reviewers" DROP COLUMN egcs_cn_group`.execute(db)
  await sql`ALTER TABLE "Common_Additional_Reviewers" ALTER COLUMN egcs_cn_user SET NOT NULL`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_reset_additional_reviewer_completion() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.egcs_cn_user IS DISTINCT FROM OLD.egcs_cn_user THEN
        NEW.egcs_cn_completedat := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP CONSTRAINT cn_chk_approval_onbehalf`.execute(db)
  await sql`ALTER TABLE "Common_Approval" DROP COLUMN egcs_cn_assignedgroup, DROP COLUMN egcs_cn_defaultgroup`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ALTER COLUMN egcs_cn_defaultuser SET NOT NULL`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approvaldefaultuserassigneduseronbehalfnull
    CHECK (NOT (egcs_cn_defaultuser <> egcs_cn_assigneduser AND egcs_cn_onbehalf IS NULL))`.execute(db)
  await sql`ALTER TABLE "Common_Approval" ADD CONSTRAINT cn_chk_approvalassigneduseronbehalfapprovalpositiontitlenotnull
    CHECK (NOT (egcs_cn_defaultuser = egcs_cn_assigneduser AND egcs_cn_onbehalf IS NOT NULL))`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Step" DROP COLUMN egcs_cn_defaultgroup`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Step" ALTER COLUMN egcs_cn_defaultuser SET NOT NULL`.execute(db)
  await sql`DELETE FROM role_permission WHERE subject = 'group'`.execute(db)
  await sql`ALTER TABLE role_permission DROP CONSTRAINT role_permission_subject_check`.execute(db)
  await sql`ALTER TABLE role_permission ADD CONSTRAINT role_permission_subject_check CHECK (subject IN ('audit', 'system', 'agency', 'transfer_payment', 'role', 'user', 'agreement', 'applicant_recipient'))`.execute(db)
  await sql`DROP TABLE "Common_Group_Member"`.execute(db)
  await sql`DROP TABLE "Common_Group"`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_enforce_entity_assignment_roster() RETURNS trigger AS $$
    DECLARE target_id bigint; target_type varchar(128); active_count integer; primary_count integer; target_deleted boolean;
    BEGIN
      target_id := COALESCE(NEW.egcs_cn_entityid, OLD.egcs_cn_entityid);
      target_type := COALESCE(NEW.egcs_cn_entitytype, OLD.egcs_cn_entitytype);
      SELECT _deleted INTO target_deleted FROM "Common_Entity"
        WHERE id = target_id AND egcs_cn_entitytype = target_type;
      IF COALESCE(target_deleted, true) THEN RETURN NULL; END IF;
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary) INTO active_count, primary_count
        FROM "Common_Entity_Assignment"
        WHERE egcs_cn_entityid = target_id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active entity assignment roster requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentroster';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql`.execute(db)
  await sql`CREATE OR REPLACE FUNCTION trg_fn_enforce_assignable_entity_roster() RETURNS trigger AS $$
    DECLARE active_count integer; primary_count integer; target_type varchar(128);
    BEGIN
      IF NEW._deleted = true THEN RETURN NULL; END IF;
      target_type := TG_ARGV[0]::varchar(128);
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary) INTO active_count, primary_count
        FROM "Common_Entity_Assignment"
        WHERE egcs_cn_entityid = NEW.id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active assignable entity requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_assignableentityroster';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql`.execute(db)
}
