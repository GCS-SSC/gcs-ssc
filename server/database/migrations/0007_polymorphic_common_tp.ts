import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import type { Database } from '../../../shared/types/database'
import {
  COMPLETION_DISPOSITIONS,
  PUBLICATION_KINDS,
  RUNTIME_ITEM_KINDS,
  RUNTIME_KINDS,
  SYSTEM_LIFECYCLE
} from '../../../shared/constants/system-lifecycle.js'
import { CORE_ENTITY_DEFINITIONS } from '../../../shared/constants/entity-registry.js'

const transitionPredicate = (
  graph: Record<string, readonly string[]>,
  fromExpression: string,
  toExpression: string
) => sql.join(Object.entries(graph).filter(([, targets]) => targets.length > 0).map(([from, targets]) => sql`
  (${sql.raw(fromExpression)} = ${sql.lit(from)} AND ${sql.raw(toExpression)} IN (${sql.join(targets.map(value => sql.lit(value))) }))
`), sql` OR `)

const publicationTransitionPredicate = (fromExpression: string, toExpression: string) =>
  transitionPredicate(SYSTEM_LIFECYCLE.publication.transitions, fromExpression, toExpression)
const runtimeTransitionPredicate = (fromExpression: string, toExpression: string) =>
  transitionPredicate(SYSTEM_LIFECYCLE.runtime.transitions, fromExpression, toExpression)

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Language_Preference' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Language_Preference" AS ENUM ('eng', 'fra');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Review_Type' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Review_Type" AS ENUM ('checklist', 'assessment');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Checklist_Result' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Checklist_Result" AS ENUM ('pass', 'pass_with_considerations', 'fail');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Checklist_Answer' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Checklist_Answer" AS ENUM ('pass', 'fail');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Monitor_Action_Type' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Monitor_Action_Type" AS ENUM ('amendment', 'mandatoryaction', 'suggestedaction', 'none');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Monitor_Responsible_Party' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE "Monitor_Responsible_Party" AS ENUM ('applicantrecipient', 'organization', 'joint');
      END IF;
    END $$;
  `.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db)
  await sql`ALTER TABLE "Agency_Profile" ADD COLUMN IF NOT EXISTS "egcs_ay_gwcoa_number" bigint`.execute(db)
  await sql`ALTER TABLE "Agency_Profile" ALTER COLUMN "egcs_ay_gwcoa_number" SET NOT NULL`.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_User" (
      id bigserial PRIMARY KEY,
      egcs_cn_auth_user_id bigint NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE RESTRICT,
      egcs_cn_name text NOT NULL,
      egcs_cn_position_title text NOT NULL,
      egcs_cn_email citext NOT NULL,
      egcs_cn_email_verified boolean NOT NULL,
      egcs_cn_image text,
      egcs_cn_created_at timestamptz NOT NULL,
      egcs_cn_updated_at timestamptz NOT NULL,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_useremail ON "Common_User" (egcs_cn_email) WHERE _deleted = false`.execute(
    db
  )

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_GWCOA" (
      id bigserial PRIMARY KEY,
      egcs_cn_number smallint NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_uq_gwcoa_number UNIQUE (egcs_cn_number)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_gwcoanumbernameen
    ON "Common_GWCOA" (egcs_cn_number, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_gwcoanumbernamefr
    ON "Common_GWCOA" (egcs_cn_number, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    ALTER TABLE "Agency_Profile"
      DROP CONSTRAINT IF EXISTS ay_ref_profilegwcoanumber,
      ADD CONSTRAINT ay_ref_profilegwcoanumber
      FOREIGN KEY ("egcs_ay_gwcoa_number")
      REFERENCES "Common_GWCOA"("egcs_cn_number")
      ON DELETE RESTRICT
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Entity_Type" (
      egcs_cn_type varchar(128) PRIMARY KEY,
      egcs_cn_extensionkey varchar(128),
      egcs_cn_localtype varchar(64) NOT NULL,
      egcs_cn_label_en varchar(255) NOT NULL,
      egcs_cn_label_fr varchar(255) NOT NULL,
      egcs_cn_completion varchar(32) NOT NULL DEFAULT 'none',
      egcs_cn_approvalsubmission varchar(32) NOT NULL DEFAULT 'none',
      egcs_cn_standardworkflow varchar(32) NOT NULL DEFAULT 'none',
      egcs_cn_riskrating varchar(32) NOT NULL DEFAULT 'none',
      egcs_cn_supportsdirectreviews boolean NOT NULL DEFAULT false,
      egcs_cn_ownerkind varchar(32),
      egcs_cn_assignmentmode varchar(32),
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_entitytypekey CHECK (
        egcs_cn_type ~ '^[a-z][a-z0-9-]{0,62}(:[a-z][a-z0-9-]{0,62})?$'
        AND (egcs_cn_extensionkey IS NULL) = (position(':' in egcs_cn_type) = 0)
        AND (egcs_cn_extensionkey IS NULL OR egcs_cn_type = egcs_cn_extensionkey || ':' || egcs_cn_localtype)
      ),
      CONSTRAINT cn_chk_entitytypecompletion CHECK (egcs_cn_completion IN ('supported', 'none')),
      CONSTRAINT cn_chk_entitytypeapprovalsubmission CHECK (egcs_cn_approvalsubmission IN ('explicit', 'on_completion', 'none')),
      CONSTRAINT cn_chk_entitytypestandardworkflow CHECK (egcs_cn_standardworkflow IN ('explicit', 'none')),
      CONSTRAINT cn_chk_entitytyperiskrating CHECK (egcs_cn_riskrating IN ('explicit', 'none')),
      CONSTRAINT cn_chk_entitytypeworkflow CHECK (
        (egcs_cn_approvalsubmission <> 'on_completion' OR egcs_cn_completion = 'supported')
        AND (egcs_cn_riskrating = 'none' OR egcs_cn_type = 'fundingcaseagreement')
      ),
      CONSTRAINT cn_chk_entitytypeowner CHECK (
        (egcs_cn_ownerkind IS NULL OR egcs_cn_ownerkind IN ('agreement', 'proponent', 'runtime_source'))
        AND (egcs_cn_assignmentmode IS NULL OR egcs_cn_assignmentmode IN ('independent', 'inherited'))
      ),
      CONSTRAINT cn_chk_entitytypenotdeleted CHECK (_deleted = false)
    )
  `.execute(db)
  await db.insertInto('Common_Entity_Type').values(CORE_ENTITY_DEFINITIONS.map(definition => ({
    egcs_cn_type: definition.type,
    egcs_cn_extensionkey: null,
    egcs_cn_localtype: definition.type,
    egcs_cn_label_en: definition.label.en,
    egcs_cn_label_fr: definition.label.fr,
    egcs_cn_completion: definition.completion,
    egcs_cn_approvalsubmission: definition.approvalSubmission,
    egcs_cn_standardworkflow: definition.standardWorkflow,
    egcs_cn_riskrating: definition.riskRating,
    egcs_cn_supportsdirectreviews: definition.supportsDirectReviews,
    egcs_cn_ownerkind: definition.ownerKind,
    egcs_cn_assignmentmode: definition.assignmentMode,
    _deleted: false
  }))).onConflict(conflict => conflict.column('egcs_cn_type').doNothing()).execute()
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_entity_type() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Entity type declarations are immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entitytypeimmutable';
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_entity_type
    BEFORE UPDATE OR DELETE ON "Common_Entity_Type"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_entity_type()
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Entity" (
      id bigserial PRIMARY KEY,
      egcs_cn_entitytype varchar(128) NOT NULL REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_entityidentitytype ON "Common_Entity" (id, egcs_cn_entitytype)`.execute(
    db
  )
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Extension_Entity_Owner" (
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_ownerid bigint NOT NULL,
      egcs_cn_ownertype varchar(128) NOT NULL,
      CONSTRAINT cn_pk_extensionentityowner PRIMARY KEY (egcs_cn_entityid, egcs_cn_entitytype),
      CONSTRAINT cn_chk_extensionentityownertype CHECK (
        egcs_cn_ownertype IN ('fundingcaseagreement', 'applicantrecipient')
      ),
      CONSTRAINT cn_ref_extensionentityowner_target
        FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_extensionentityowner_owner
        FOREIGN KEY (egcs_cn_ownerid, egcs_cn_ownertype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION bind_extension_entity_owner() RETURNS trigger AS $$
    DECLARE target_id bigint; owner_id bigint;
    BEGIN
      target_id := (to_jsonb(NEW) ->> TG_ARGV[1])::bigint;
      owner_id := (to_jsonb(NEW) ->> TG_ARGV[3])::bigint;
      IF target_id IS NULL OR owner_id IS NULL THEN
        RAISE EXCEPTION 'Extension lifecycle entity owner binding requires non-null target and owner identities'
          USING ERRCODE = '23502';
      END IF;
      INSERT INTO "Common_Extension_Entity_Owner" (
        egcs_cn_entityid,
        egcs_cn_entitytype,
        egcs_cn_ownerid,
        egcs_cn_ownertype
      ) VALUES (target_id, TG_ARGV[0], owner_id, TG_ARGV[2]);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION lock_extension_entity_owner_column() RETURNS trigger AS $$
    BEGIN
      IF (to_jsonb(NEW) -> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) -> TG_ARGV[0]) THEN
        RAISE EXCEPTION 'Extension lifecycle entity owner identity is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_extensionentityownercolumnimmutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION lock_extension_entity_owner_binding() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Extension lifecycle entity owner binding is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_extensionentityownerbindingimmutable';
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_extension_entity_owner_binding
    BEFORE UPDATE OR DELETE ON "Common_Extension_Entity_Owner"
    FOR EACH ROW EXECUTE FUNCTION lock_extension_entity_owner_binding()
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Entity_Assignment" (
      id bigserial PRIMARY KEY,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_user bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_isprimary boolean NOT NULL DEFAULT false,
      egcs_cn_createdby bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_ref_entityassignmentidentitytype
        FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_entity_assignment_type() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type.egcs_cn_assignmentmode IS NOT NULL
          AND entity_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Entity type does not support assignments'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmenttype';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_entity_assignment_type
    BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Entity_Assignment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_entity_assignment_type()
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_entityassignment_active_user
    ON "Common_Entity_Assignment" (egcs_cn_entityid, egcs_cn_entitytype, egcs_cn_user)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_entityassignment_active_primary
    ON "Common_Entity_Assignment" (egcs_cn_entityid, egcs_cn_entitytype)
    WHERE _deleted = false AND egcs_cn_isprimary = true
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_prevent_entity_assignment_identity_update() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_entityid IS DISTINCT FROM OLD.egcs_cn_entityid
        OR NEW.egcs_cn_entitytype IS DISTINCT FROM OLD.egcs_cn_entitytype THEN
        RAISE EXCEPTION 'entity assignment identity is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentidentityimmutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_prevent_entity_assignment_identity_update
    BEFORE UPDATE OF egcs_cn_entityid, egcs_cn_entitytype ON "Common_Entity_Assignment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_prevent_entity_assignment_identity_update()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_entity_assignment_roster() RETURNS trigger AS $$
    DECLARE target_id bigint; target_type varchar(128); active_count integer; primary_count integer; target_deleted boolean;
    BEGIN
      target_id := COALESCE(NEW.egcs_cn_entityid, OLD.egcs_cn_entityid);
      target_type := COALESCE(NEW.egcs_cn_entitytype, OLD.egcs_cn_entitytype);
      SELECT _deleted INTO target_deleted
      FROM "Common_Entity"
      WHERE id = target_id AND egcs_cn_entitytype = target_type;
      IF COALESCE(target_deleted, true) THEN RETURN NULL; END IF;
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary)
        INTO active_count, primary_count
      FROM "Common_Entity_Assignment"
      WHERE egcs_cn_entityid = target_id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active entity assignment roster requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_entityassignmentroster';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_entity_assignment_roster
    AFTER INSERT OR UPDATE OR DELETE ON "Common_Entity_Assignment"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_entity_assignment_roster()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_assignable_entity_roster() RETURNS trigger AS $$
    DECLARE active_count integer; primary_count integer; target_type varchar(128);
    BEGIN
      IF NEW._deleted = true THEN RETURN NULL; END IF;
      target_type := TG_ARGV[0]::varchar(128);
      SELECT count(*), count(*) FILTER (WHERE egcs_cn_isprimary)
        INTO active_count, primary_count
      FROM "Common_Entity_Assignment"
      WHERE egcs_cn_entityid = NEW.id AND egcs_cn_entitytype = target_type AND _deleted = false;
      IF active_count < 1 OR primary_count <> 1 THEN
        RAISE EXCEPTION 'active assignable entity requires at least one assignee and exactly one primary'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_assignableentityroster';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_soft_delete_entity_assignments() RETURNS trigger AS $$
    BEGIN
      IF OLD._deleted = false AND NEW._deleted = true THEN
        UPDATE "Common_Entity"
        SET _deleted = true
        WHERE id = NEW.id AND egcs_cn_entitytype = TG_ARGV[0]::varchar(128) AND _deleted = false;
        UPDATE "Common_Entity_Assignment"
        SET _deleted = true
        WHERE egcs_cn_entityid = NEW.id AND egcs_cn_entitytype = TG_ARGV[0]::varchar(128) AND _deleted = false;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION register_entity() RETURNS trigger AS $$
    DECLARE
      allocated_id bigint;
    BEGIN
      INSERT INTO "Common_Entity" (egcs_cn_entitytype)
      VALUES (TG_ARGV[0]::varchar(128))
      RETURNING id INTO allocated_id;

      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    INSERT INTO "Common_Entity" (id, egcs_cn_entitytype, _deleted)
    SELECT stream.id, 'transferpaymentstream'::varchar(128), false
    FROM "Transfer_Payment_Stream" stream
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Common_Entity" entity
      WHERE entity.id = stream.id
        AND entity.egcs_cn_entitytype = 'transferpaymentstream'::varchar(128)
    )
  `.execute(db)
  await sql`
    ALTER TABLE "Transfer_Payment_Stream"
      DROP CONSTRAINT IF EXISTS tp_ref_streamid,
      ADD CONSTRAINT tp_ref_streamid
      FOREIGN KEY (id)
      REFERENCES "Common_Entity"(id)
      ON DELETE RESTRICT
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_transferpaymentstream ON "Transfer_Payment_Stream"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_transferpaymentstream
    BEFORE INSERT ON "Transfer_Payment_Stream"
    FOR EACH ROW EXECUTE FUNCTION register_entity('transferpaymentstream');
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_soft_delete_transferpaymentstream_assignments ON "Transfer_Payment_Stream"`.execute(db)
  await sql`
    CREATE TRIGGER trg_soft_delete_transferpaymentstream_assignments
    AFTER UPDATE OF _deleted ON "Transfer_Payment_Stream"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('transferpaymentstream');
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication" (
      id bigserial PRIMARY KEY,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_state varchar(32) NOT NULL DEFAULT 'draft',
      egcs_cn_currentversion bigint,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_publicationkind CHECK (
        egcs_cn_kind IN (${sql.join(PUBLICATION_KINDS.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_publicationstate CHECK (
        egcs_cn_state IN (${sql.join(SYSTEM_LIFECYCLE.publication.states.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_publicationdeleted CHECK (_deleted = false OR egcs_cn_state = 'draft'),
      CONSTRAINT cn_chk_publicationinitial CHECK (
        (egcs_cn_state = 'draft' AND egcs_cn_currentversion IS NULL)
        OR (egcs_cn_state IN ('published', 'retired') AND egcs_cn_currentversion IS NOT NULL)
      ),
      CONSTRAINT cn_uq_publicationidkind UNIQUE (id, egcs_cn_kind)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication_Version" (
      id bigserial PRIMARY KEY,
      egcs_cn_publication bigint NOT NULL,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_version integer NOT NULL CHECK (egcs_cn_version > 0),
      egcs_cn_definition jsonb NOT NULL CHECK (jsonb_typeof(egcs_cn_definition) = 'object'),
      egcs_cn_hash char(64) NOT NULL CHECK (egcs_cn_hash ~ '^[0-9a-f]{64}$'),
      egcs_cn_actor bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cn_ref_publicationversionpublicationkind
        FOREIGN KEY (egcs_cn_publication, egcs_cn_kind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_publicationversion UNIQUE (egcs_cn_publication, egcs_cn_version),
      CONSTRAINT cn_uq_publicationversionpublication UNIQUE (id, egcs_cn_publication),
      CONSTRAINT cn_uq_publicationversionpublicationkind UNIQUE (id, egcs_cn_publication, egcs_cn_kind),
      CONSTRAINT cn_uq_publicationversionidentity UNIQUE (id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version)
    )
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Publication"
      ADD CONSTRAINT cn_ref_publicationcurrentversion
      FOREIGN KEY (egcs_cn_currentversion, id, egcs_cn_kind)
      REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind)
      DEFERRABLE INITIALLY DEFERRED
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication_Transition" (
      id bigserial PRIMARY KEY,
      egcs_cn_publication bigint NOT NULL REFERENCES "Common_Publication"(id) ON DELETE RESTRICT,
      egcs_cn_fromstate varchar(32) NOT NULL,
      egcs_cn_tostate varchar(32) NOT NULL,
      egcs_cn_publicationversion bigint REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT,
      egcs_cn_actor bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cn_ref_publicationtransitionversion FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication)
        REFERENCES "Common_Publication_Version"(id, egcs_cn_publication) ON DELETE RESTRICT,
      CONSTRAINT cn_chk_publicationtransitionstates CHECK (
        egcs_cn_fromstate IN (${sql.join(SYSTEM_LIFECYCLE.publication.states.map(value => sql.lit(value)))})
        AND egcs_cn_tostate IN (${sql.join(SYSTEM_LIFECYCLE.publication.states.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_publicationtransitiongraph CHECK (
        ${publicationTransitionPredicate('egcs_cn_fromstate', 'egcs_cn_tostate')}
      )
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication_Version_Reference" (
      id bigserial PRIMARY KEY,
      egcs_cn_parentversion bigint NOT NULL REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT,
      egcs_cn_path varchar(128) NOT NULL,
      egcs_cn_order numeric,
      egcs_cn_publication bigint NOT NULL,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_publicationversion bigint NOT NULL,
      egcs_cn_version integer NOT NULL CHECK (egcs_cn_version > 0),
      CONSTRAINT cn_ref_publicationversionreference
        FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication, egcs_cn_kind, egcs_cn_version)
        REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_publicationversionreference UNIQUE NULLS NOT DISTINCT
        (egcs_cn_parentversion, egcs_cn_path, egcs_cn_order)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Publication_Status" (
      id bigserial PRIMARY KEY,
      egcs_cn_publicationversion bigint NOT NULL REFERENCES "Common_Publication_Version"(id) ON DELETE RESTRICT,
      egcs_cn_status bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_role varchar(32) NOT NULL CHECK (egcs_cn_role IN (
        'allowed_start', 'materialization', 'success', 'failure', 'cancellation', 'execution_failure'
      )),
      egcs_cn_order integer NOT NULL CHECK (egcs_cn_order > 0),
      CONSTRAINT cn_uq_workflowpublicationstatus UNIQUE
        (egcs_cn_publicationversion, egcs_cn_role, egcs_cn_order)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication_Selection" (
      id bigserial PRIMARY KEY,
      egcs_cn_publication bigint NOT NULL,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_dimension varchar(64) NOT NULL,
      egcs_cn_key varchar(512) NOT NULL,
      CONSTRAINT cn_ref_publicationselectionpublicationkind
        FOREIGN KEY (egcs_cn_publication, egcs_cn_kind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_publicationselectionkey UNIQUE (egcs_cn_kind, egcs_cn_dimension, egcs_cn_key),
      CONSTRAINT cn_uq_publicationselectionpublication UNIQUE (egcs_cn_publication, egcs_cn_dimension)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Publication_Selection_Lock" (
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_dimension varchar(64) NOT NULL,
      egcs_cn_key varchar(512) NOT NULL,
      CONSTRAINT cn_chk_publicationselectionlockkind CHECK (
        egcs_cn_kind IN (${sql.join(PUBLICATION_KINDS.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_pk_publicationselectionlock PRIMARY KEY (egcs_cn_kind, egcs_cn_dimension, egcs_cn_key)
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_publication_evidence() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Publication versions and transition history are immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationevidenceimmutable';
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_publication_version
    BEFORE UPDATE OR DELETE ON "Common_Publication_Version"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_publication_transition
    BEFORE UPDATE OR DELETE ON "Common_Publication_Transition"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_publication_version_reference
    BEFORE UPDATE OR DELETE ON "Common_Publication_Version_Reference"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_publication_version_reference() RETURNS trigger AS $$
    DECLARE parent_kind varchar(64);
    BEGIN
      SELECT egcs_cn_kind INTO parent_kind FROM "Common_Publication_Version"
      WHERE id = NEW.egcs_cn_parentversion;
      IF NEW.egcs_cn_parentversion = NEW.egcs_cn_publicationversion OR NOT (
        (parent_kind = 'review_set_setup' AND NEW.egcs_cn_kind IN ('review_schema', 'approval_template'))
        OR (parent_kind = 'recommendation_set_setup' AND NEW.egcs_cn_kind IN ('recommendation_schema', 'approval_template'))
        OR (parent_kind = 'workflow_setup' AND NEW.egcs_cn_kind IN ('review_set_setup', 'recommendation_set_setup', 'approval_template'))
      ) THEN
        RAISE EXCEPTION 'Publication version reference kind graph is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionreferencekind';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_publication_version_reference
    BEFORE INSERT ON "Common_Publication_Version_Reference"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_version_reference()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_unsealed_publication_version() RETURNS trigger AS $$
    DECLARE parent_version bigint; locked_version bigint;
    BEGIN
      parent_version := CASE
        WHEN TG_ARGV[0] = 'reference' THEN (to_jsonb(NEW)->>'egcs_cn_parentversion')::bigint
        ELSE (to_jsonb(NEW)->>'egcs_cn_publicationversion')::bigint
      END;
      SELECT id INTO locked_version FROM "Common_Publication_Version" WHERE id = parent_version FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM "Common_Publication_Transition" transition
        WHERE transition.egcs_cn_publicationversion = parent_version
      ) THEN
        RAISE EXCEPTION 'Published version evidence is sealed'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionsealed';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_require_unsealed_publication_reference
    BEFORE INSERT ON "Common_Publication_Version_Reference"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_require_unsealed_publication_version('reference')
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_workflow_publication_status
    BEFORE UPDATE OR DELETE ON "Common_Workflow_Publication_Status"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_publication_evidence()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_require_unsealed_workflow_publication_status
    BEFORE INSERT ON "Common_Workflow_Publication_Status"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_require_unsealed_publication_version('status')
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_register_publication() RETURNS trigger AS $$
    DECLARE
      publication_kind varchar(64) := TG_ARGV[0];
      registered_kind varchar(64);
    BEGIN
      IF NEW.id IS NULL THEN
        INSERT INTO "Common_Publication" (egcs_cn_kind) VALUES (publication_kind) RETURNING id INTO NEW.id;
      ELSE
        INSERT INTO "Common_Publication" (id, egcs_cn_kind)
        VALUES (NEW.id, publication_kind)
        ON CONFLICT (id) DO NOTHING;
        SELECT egcs_cn_kind INTO registered_kind FROM "Common_Publication" WHERE id = NEW.id;
        IF registered_kind IS DISTINCT FROM publication_kind THEN
          RAISE EXCEPTION 'Publication identity is already registered with another kind'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_publicationsubtypekind';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_publication_insert() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_state <> 'draft' OR NEW.egcs_cn_currentversion IS NOT NULL OR NEW._deleted THEN
        RAISE EXCEPTION 'Publications must be created as active drafts without a version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationinitialstate';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_publication_insert
    BEFORE INSERT ON "Common_Publication"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_insert()
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Approval_Template" ALTER COLUMN id DROP DEFAULT
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Approval_Template"
      ADD COLUMN egcs_cn_publicationkind varchar(64) NOT NULL DEFAULT 'approval_template',
      ADD CONSTRAINT cn_chk_approvaltemplatepublicationkind CHECK (egcs_cn_publicationkind = 'approval_template')
  `.execute(db)
  await sql`
    INSERT INTO "Common_Publication" (id, egcs_cn_kind)
    SELECT id, 'approval_template' FROM "Common_Approval_Template"
    ON CONFLICT (id) DO NOTHING
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Approval_Template"
      ADD CONSTRAINT cn_ref_approvaltemplatepublication
      FOREIGN KEY (id, egcs_cn_publicationkind) REFERENCES "Common_Publication"(id, egcs_cn_kind)
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_approvaltemplate_publication
    BEFORE INSERT ON "Common_Approval_Template"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('approval_template')
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Runtime" (
      id bigserial PRIMARY KEY,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_purpose varchar(32) NOT NULL DEFAULT 'standard',
      egcs_cn_sourcepublication bigint NOT NULL,
      egcs_cn_sourcepublicationkind varchar(64) NOT NULL,
      egcs_cn_sourcepublicationversion bigint NOT NULL,
      egcs_cn_sourceversion integer NOT NULL CHECK (egcs_cn_sourceversion > 0),
      egcs_cn_previousruntime bigint,
      egcs_cn_attempt integer NOT NULL DEFAULT 1 CHECK (egcs_cn_attempt > 0),
      egcs_cn_initiatedby bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_state varchar(32) NOT NULL DEFAULT 'pending',
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_startedat timestamptz,
      egcs_cn_updatedat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_completedat timestamptz,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_runtimekind CHECK (
        egcs_cn_kind IN (${sql.join(RUNTIME_KINDS.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_runtimestate CHECK (
        egcs_cn_state IN (${sql.join(SYSTEM_LIFECYCLE.runtime.states.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_runtimetimestamps CHECK (
        (egcs_cn_state = 'pending' AND egcs_cn_startedat IS NULL AND egcs_cn_completedat IS NULL)
        OR (egcs_cn_state IN ('active', 'awaiting_action', 'paused') AND egcs_cn_startedat IS NOT NULL AND egcs_cn_completedat IS NULL)
        OR (egcs_cn_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') AND egcs_cn_completedat IS NOT NULL)
      ),
      CONSTRAINT cn_ref_runtimetarget FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_runtimesourceversion
        FOREIGN KEY (egcs_cn_sourcepublicationversion, egcs_cn_sourcepublication, egcs_cn_sourcepublicationkind, egcs_cn_sourceversion)
        REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_runtimeprevious FOREIGN KEY (egcs_cn_previousruntime)
        REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_runtimeidentity UNIQUE (id, egcs_cn_kind, egcs_cn_entitytype, egcs_cn_entityid)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_runtime_active_target
    ON "Common_Runtime" (
      egcs_cn_kind,
      egcs_cn_entitytype,
      egcs_cn_entityid,
      egcs_cn_purpose,
      egcs_cn_sourcepublication
    )
    WHERE egcs_cn_kind <> 'workflow'
      AND _deleted = false AND egcs_cn_state IN ('pending', 'active', 'awaiting_action', 'paused')
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflow_runtime_active_target
    ON "Common_Runtime" (egcs_cn_entitytype, egcs_cn_entityid)
    WHERE egcs_cn_kind = 'workflow'
      AND _deleted = false AND egcs_cn_state IN ('pending', 'active', 'awaiting_action', 'paused')
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_runtime_previous_successor
    ON "Common_Runtime" (egcs_cn_previousruntime)
    WHERE egcs_cn_previousruntime IS NOT NULL
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Runtime_Item" (
      id bigserial PRIMARY KEY,
      egcs_cn_runtime bigint NOT NULL REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
      egcs_cn_parentruntimeitem bigint,
      egcs_cn_kind varchar(64) NOT NULL,
      egcs_cn_order numeric NOT NULL CHECK (egcs_cn_order > 0),
      egcs_cn_publication bigint NOT NULL,
      egcs_cn_publicationkind varchar(64) NOT NULL,
      egcs_cn_publicationversion bigint NOT NULL,
      egcs_cn_version integer NOT NULL CHECK (egcs_cn_version > 0),
      egcs_cn_state varchar(32) NOT NULL DEFAULT 'pending',
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_startedat timestamptz,
      egcs_cn_updatedat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_completedat timestamptz,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_runtimeitemkind CHECK (
        egcs_cn_kind IN (${sql.join(RUNTIME_ITEM_KINDS.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_runtimeitemstate CHECK (
        egcs_cn_state IN (${sql.join(SYSTEM_LIFECYCLE.runtime.states.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_chk_runtimeitemtimestamps CHECK (
        (egcs_cn_state = 'pending' AND egcs_cn_startedat IS NULL AND egcs_cn_completedat IS NULL)
        OR (egcs_cn_state IN ('active', 'awaiting_action', 'paused') AND egcs_cn_startedat IS NOT NULL AND egcs_cn_completedat IS NULL)
        OR (egcs_cn_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') AND egcs_cn_completedat IS NOT NULL)
      ),
      CONSTRAINT cn_ref_runtimeitemversion
        FOREIGN KEY (egcs_cn_publicationversion, egcs_cn_publication, egcs_cn_publicationkind, egcs_cn_version)
        REFERENCES "Common_Publication_Version"(id, egcs_cn_publication, egcs_cn_kind, egcs_cn_version) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_runtimeitemidentity UNIQUE (id, egcs_cn_runtime),
      CONSTRAINT cn_ref_runtimeitemparent FOREIGN KEY (egcs_cn_parentruntimeitem, egcs_cn_runtime)
        REFERENCES "Common_Runtime_Item"(id, egcs_cn_runtime) ON DELETE RESTRICT,
      CONSTRAINT cn_uq_runtimeitemorder UNIQUE NULLS NOT DISTINCT (egcs_cn_runtime, egcs_cn_parentruntimeitem, egcs_cn_order)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Runtime_Transition" (
      id bigserial PRIMARY KEY,
      egcs_cn_runtime bigint NOT NULL REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
      egcs_cn_runtimeitem bigint,
      egcs_cn_fromstate varchar(32) NOT NULL,
      egcs_cn_tostate varchar(32) NOT NULL,
      egcs_cn_actor bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_reason varchar(128),
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cn_ref_runtimetransitionitem FOREIGN KEY (egcs_cn_runtimeitem, egcs_cn_runtime)
        REFERENCES "Common_Runtime_Item"(id, egcs_cn_runtime) ON DELETE RESTRICT,
      CONSTRAINT cn_chk_runtimetransitiongraph CHECK (
        ${runtimeTransitionPredicate('egcs_cn_fromstate', 'egcs_cn_tostate')}
      )
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_runtime_transition() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Runtime transition history is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionimmutable';
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_runtime_transition
    BEFORE UPDATE OR DELETE ON "Common_Runtime_Transition"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_runtime_transition()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_publication_version_insert() RETURNS trigger AS $$
    DECLARE
      publication_row "Common_Publication"%ROWTYPE;
      expected_version integer;
      previous_hash char(64);
    BEGIN
      SELECT * INTO publication_row FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_publication FOR UPDATE;
      IF NOT FOUND OR publication_row._deleted OR publication_row.egcs_cn_state = 'retired' THEN
        RAISE EXCEPTION 'Publication is unavailable for publication'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionavailable';
      END IF;
      IF NEW.egcs_cn_kind IS DISTINCT FROM publication_row.egcs_cn_kind THEN
        RAISE EXCEPTION 'Publication version kind does not match its publication'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_publicationversionpublicationkind';
      END IF;
      SELECT COALESCE(max(egcs_cn_version), 0) + 1, (array_agg(egcs_cn_hash ORDER BY egcs_cn_version DESC))[1]
      INTO expected_version, previous_hash
      FROM "Common_Publication_Version" WHERE egcs_cn_publication = NEW.egcs_cn_publication;
      IF NEW.egcs_cn_version <> expected_version THEN
        RAISE EXCEPTION 'Publication versions must be contiguous'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionsequence';
      END IF;
      IF previous_hash IS NOT NULL AND previous_hash = NEW.egcs_cn_hash THEN
        RAISE EXCEPTION 'Publication definition has not changed'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionchanged';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_publication_version_insert
    BEFORE INSERT ON "Common_Publication_Version"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_version_insert()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_publication_update() RETURNS trigger AS $$
    BEGIN
      IF current_setting('app.publication_transition', true) IS DISTINCT FROM 'on'
        AND (NEW.egcs_cn_state, NEW.egcs_cn_currentversion) IS DISTINCT FROM (OLD.egcs_cn_state, OLD.egcs_cn_currentversion) THEN
        RAISE EXCEPTION 'Publication lifecycle changes require a transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitionrequired';
      END IF;
      IF OLD.egcs_cn_state = 'retired' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'Retired publications are immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationretiredimmutable';
      END IF;
      IF OLD._deleted = true AND NEW._deleted = false THEN
        RAISE EXCEPTION 'Deleted publications cannot be restored'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationnorestore';
      END IF;
      IF NEW._deleted AND (
        NEW.egcs_cn_state <> 'draft'
        OR EXISTS (SELECT 1 FROM "Common_Publication_Version" version WHERE version.egcs_cn_publication = NEW.id)
        OR EXISTS (SELECT 1 FROM "Common_Runtime" runtime WHERE runtime.egcs_cn_sourcepublication = NEW.id)
        OR EXISTS (SELECT 1 FROM "Common_Runtime_Item" item WHERE item.egcs_cn_publication = NEW.id)
      ) THEN
        RAISE EXCEPTION 'Only unreferenced drafts may be deleted'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationdelete';
      END IF;
      IF NEW.egcs_cn_state = 'draft' AND NEW.egcs_cn_currentversion IS NOT NULL THEN
        RAISE EXCEPTION 'Draft publications cannot have a current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationcurrentstate';
      END IF;
      IF NEW.egcs_cn_state IN ('published', 'retired') AND NEW.egcs_cn_currentversion IS NULL THEN
        RAISE EXCEPTION 'Published and retired publications require a current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationcurrentstate';
      END IF;
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state OR NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion THEN
        IF NOT (${publicationTransitionPredicate('OLD.egcs_cn_state', 'NEW.egcs_cn_state')})
          OR (OLD.egcs_cn_state = 'draft' AND NEW.egcs_cn_currentversion IS NULL)
          OR (OLD.egcs_cn_state = 'published' AND NEW.egcs_cn_state = 'published' AND NEW.egcs_cn_currentversion IS NOT DISTINCT FROM OLD.egcs_cn_currentversion)
          OR (NEW.egcs_cn_state = 'retired' AND NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion) THEN
          RAISE EXCEPTION 'Invalid publication transition'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitiongraph';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_apply_publication_transition() RETURNS trigger AS $$
    DECLARE
      publication_row "Common_Publication"%ROWTYPE;
      version_row "Common_Publication_Version"%ROWTYPE;
    BEGIN
      SELECT * INTO publication_row FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_publication FOR UPDATE;
      IF NOT FOUND OR publication_row._deleted OR publication_row.egcs_cn_state <> NEW.egcs_cn_fromstate THEN
        RAISE EXCEPTION 'Publication transition does not match the current state'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitioncurrent';
      END IF;
      SELECT * INTO version_row FROM "Common_Publication_Version"
      WHERE id = NEW.egcs_cn_publicationversion AND egcs_cn_publication = publication_row.id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication transition version is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_publicationtransitionversion';
      END IF;
      IF NEW.egcs_cn_tostate = 'published' THEN
        IF publication_row.egcs_cn_state = 'draft' AND version_row.egcs_cn_version <> 1 THEN
          RAISE EXCEPTION 'Initial publication must use version one'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationinitialversion';
        END IF;
        IF publication_row.egcs_cn_state = 'published' AND publication_row.egcs_cn_currentversion = version_row.id THEN
          RAISE EXCEPTION 'Republishing requires a new version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationrepublishversion';
        END IF;
        IF publication_row.egcs_cn_state = 'published' AND version_row.egcs_cn_version <= (
          SELECT current_version.egcs_cn_version
          FROM "Common_Publication_Version" current_version
          WHERE current_version.id = publication_row.egcs_cn_currentversion
        ) THEN
          RAISE EXCEPTION 'Republishing must advance the current version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationversionforward';
        END IF;
      ELSIF NEW.egcs_cn_tostate = 'retired' AND publication_row.egcs_cn_currentversion <> version_row.id THEN
        RAISE EXCEPTION 'Retirement must reference the current version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationretireversion';
      END IF;
      PERFORM set_config('app.publication_transition', 'on', true);
      UPDATE "Common_Publication"
      SET egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_currentversion = CASE WHEN NEW.egcs_cn_tostate = 'published' THEN version_row.id ELSE egcs_cn_currentversion END
      WHERE id = publication_row.id;
      PERFORM set_config('app.publication_transition', '', true);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_apply_publication_transition
    BEFORE INSERT ON "Common_Publication_Transition"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_apply_publication_transition()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_publication_update
    BEFORE UPDATE ON "Common_Publication"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_publication_update()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_publication_transition() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state OR NEW.egcs_cn_currentversion IS DISTINCT FROM OLD.egcs_cn_currentversion THEN
        IF NOT EXISTS (
          SELECT 1 FROM "Common_Publication_Transition" transition
          WHERE transition.egcs_cn_publication = NEW.id
            AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
            AND transition.egcs_cn_tostate = NEW.egcs_cn_state
            AND transition.egcs_cn_publicationversion = NEW.egcs_cn_currentversion
        ) THEN
          RAISE EXCEPTION 'Publication state changes require transition history'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationtransitionhistory';
        END IF;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_require_publication_transition
    AFTER UPDATE OF egcs_cn_state, egcs_cn_currentversion ON "Common_Publication"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_require_publication_transition()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_runtime_insert() RETURNS trigger AS $$
    DECLARE
      source_state varchar(32);
      previous_row "Common_Runtime"%ROWTYPE;
    BEGIN
      IF NEW.egcs_cn_state <> 'pending' OR NEW.egcs_cn_startedat IS NOT NULL OR NEW.egcs_cn_completedat IS NOT NULL THEN
        RAISE EXCEPTION 'Runtimes must be created pending'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeinitialstate';
      END IF;
      IF NOT (
        (NEW.egcs_cn_kind = 'workflow' AND NEW.egcs_cn_sourcepublicationkind = 'workflow_setup')
        OR (NEW.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_sourcepublicationkind = 'review_set_setup')
      ) THEN
        RAISE EXCEPTION 'Runtime kind is incompatible with its source publication kind'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimesourcekind';
      END IF;
      SELECT egcs_cn_state INTO source_state FROM "Common_Publication"
      WHERE id = NEW.egcs_cn_sourcepublication AND _deleted = false;
      IF NEW.egcs_cn_previousruntime IS NULL THEN
        IF NEW.egcs_cn_attempt <> 1 OR source_state <> 'published' THEN
          RAISE EXCEPTION 'New runtimes require attempt one and a published source'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimenewattempt';
        END IF;
      ELSE
        SELECT * INTO previous_row FROM "Common_Runtime"
        WHERE id = NEW.egcs_cn_previousruntime FOR UPDATE;
        IF NOT FOUND
          OR previous_row.egcs_cn_state NOT IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
          OR NEW.egcs_cn_attempt <> previous_row.egcs_cn_attempt + 1
          OR (NEW.egcs_cn_kind, NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid, NEW.egcs_cn_purpose) IS DISTINCT FROM
             (previous_row.egcs_cn_kind, previous_row.egcs_cn_entitytype, previous_row.egcs_cn_entityid, previous_row.egcs_cn_purpose)
          OR (NEW.egcs_cn_sourcepublication, NEW.egcs_cn_sourcepublicationversion, NEW.egcs_cn_sourceversion) IS DISTINCT FROM
             (previous_row.egcs_cn_sourcepublication, previous_row.egcs_cn_sourcepublicationversion, previous_row.egcs_cn_sourceversion)
        THEN
          RAISE EXCEPTION 'Retry must follow a terminal attempt and retain its exact source version'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeretry';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_runtime_insert
    BEFORE INSERT ON "Common_Runtime"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_insert()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_runtime_item_insert() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'INSERT' AND (NEW.egcs_cn_state <> 'pending' OR NEW.egcs_cn_startedat IS NOT NULL OR NEW.egcs_cn_completedat IS NOT NULL) THEN
        RAISE EXCEPTION 'Runtime items must be created pending'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeiteminitialstate';
      END IF;
      IF NOT (
        (NEW.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_publicationkind = 'review_set_setup')
        OR (NEW.egcs_cn_kind = 'review' AND NEW.egcs_cn_publicationkind = 'review_schema')
        OR (NEW.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_publicationkind = 'recommendation_set_setup')
        OR (NEW.egcs_cn_kind = 'recommendation' AND NEW.egcs_cn_publicationkind = 'recommendation_schema')
        OR (NEW.egcs_cn_kind IN ('routing_slip', 'approval_step') AND NEW.egcs_cn_publicationkind = 'approval_template')
      ) THEN
        RAISE EXCEPTION 'Runtime item kind is incompatible with its publication kind'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitempublicationkind';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_runtime_item_insert
    BEFORE INSERT OR UPDATE OF egcs_cn_kind, egcs_cn_publicationkind ON "Common_Runtime_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_item_insert()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_runtime_item_hierarchy() RETURNS trigger AS $$
    DECLARE
      runtime_row "Common_Runtime"%ROWTYPE;
      parent_row "Common_Runtime_Item"%ROWTYPE;
      grandparent_row "Common_Runtime_Item"%ROWTYPE;
      publication_state varchar(32);
      retired_at timestamptz;
      hierarchy_valid boolean := false;
      reference_valid boolean := false;
    BEGIN
      SELECT * INTO runtime_row FROM "Common_Runtime" WHERE id = NEW.egcs_cn_runtime FOR UPDATE;
      IF NOT FOUND THEN RETURN NEW; END IF;
      IF runtime_row.egcs_cn_previousruntime IS NULL THEN
        SELECT egcs_cn_state INTO publication_state FROM "Common_Publication"
        WHERE id = NEW.egcs_cn_publication AND _deleted = false;
        IF publication_state = 'retired' THEN
          SELECT transition.egcs_cn_createdat INTO retired_at
          FROM "Common_Publication_Transition" transition
          WHERE transition.egcs_cn_publication = NEW.egcs_cn_publication
            AND transition.egcs_cn_tostate = 'retired'
          ORDER BY transition.id DESC LIMIT 1;
        END IF;
        IF publication_state NOT IN ('published', 'retired')
          OR (publication_state = 'retired' AND (retired_at IS NULL OR retired_at <= runtime_row.egcs_cn_createdat)) THEN
          RAISE EXCEPTION 'New runtimes may only select published item versions'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitempublished';
        END IF;
      END IF;
      IF NEW.egcs_cn_parentruntimeitem IS NULL THEN
        hierarchy_valid :=
          (runtime_row.egcs_cn_kind = 'workflow' AND NEW.egcs_cn_kind IN ('review_set', 'recommendation_set', 'routing_slip'))
          OR (runtime_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind = 'review_set');
        reference_valid := NEW.egcs_cn_publicationversion = runtime_row.egcs_cn_sourcepublicationversion
          OR EXISTS (
            SELECT 1 FROM "Common_Publication_Version_Reference" reference
            WHERE reference.egcs_cn_parentversion = runtime_row.egcs_cn_sourcepublicationversion
              AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
              AND runtime_row.egcs_cn_kind = 'workflow'
              AND reference.egcs_cn_path = CASE NEW.egcs_cn_kind
                WHEN 'review_set' THEN 'members.review_set'
                WHEN 'recommendation_set' THEN 'members.recommendation_set'
                WHEN 'routing_slip' THEN 'members.approval_template'
              END
              AND reference.egcs_cn_order = NEW.egcs_cn_order
          );
      ELSE
        SELECT * INTO parent_row FROM "Common_Runtime_Item"
        WHERE id = NEW.egcs_cn_parentruntimeitem AND egcs_cn_runtime = NEW.egcs_cn_runtime;
        IF parent_row.egcs_cn_parentruntimeitem IS NOT NULL THEN
          SELECT * INTO grandparent_row FROM "Common_Runtime_Item"
          WHERE id = parent_row.egcs_cn_parentruntimeitem
            AND egcs_cn_runtime = NEW.egcs_cn_runtime;
        END IF;
        hierarchy_valid :=
          (parent_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind IN ('review', 'routing_slip'))
          OR (parent_row.egcs_cn_kind = 'review' AND NEW.egcs_cn_kind = 'routing_slip')
          OR (parent_row.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_kind IN ('recommendation', 'routing_slip'))
          OR (parent_row.egcs_cn_kind = 'recommendation' AND NEW.egcs_cn_kind = 'routing_slip')
          OR (parent_row.egcs_cn_kind = 'routing_slip' AND NEW.egcs_cn_kind = 'approval_step');
        reference_valid := (
          parent_row.egcs_cn_kind = 'routing_slip'
          AND NEW.egcs_cn_kind = 'approval_step'
          AND NEW.egcs_cn_publicationversion = parent_row.egcs_cn_publicationversion
        ) OR EXISTS (
          SELECT 1 FROM "Common_Publication_Version_Reference" reference
          WHERE reference.egcs_cn_parentversion = parent_row.egcs_cn_publicationversion
            AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
            AND (
              (parent_row.egcs_cn_kind = 'review_set' AND NEW.egcs_cn_kind = 'review'
                AND reference.egcs_cn_path = 'members.schema' AND reference.egcs_cn_order = NEW.egcs_cn_order)
              OR (parent_row.egcs_cn_kind = 'recommendation_set' AND NEW.egcs_cn_kind = 'recommendation'
                AND reference.egcs_cn_path = 'members.schema' AND reference.egcs_cn_order = NEW.egcs_cn_order)
              OR (parent_row.egcs_cn_kind IN ('review_set', 'recommendation_set') AND NEW.egcs_cn_kind = 'routing_slip'
                AND reference.egcs_cn_path = 'finalApproval' AND reference.egcs_cn_order IS NULL)
            )
        ) OR (
          NEW.egcs_cn_kind = 'routing_slip'
          AND parent_row.egcs_cn_kind IN ('review', 'recommendation')
          AND grandparent_row.egcs_cn_kind IN ('review_set', 'recommendation_set')
          AND EXISTS (
            SELECT 1 FROM "Common_Publication_Version_Reference" reference
            WHERE reference.egcs_cn_parentversion = grandparent_row.egcs_cn_publicationversion
              AND reference.egcs_cn_path = 'members.approval'
              AND reference.egcs_cn_order = parent_row.egcs_cn_order
              AND reference.egcs_cn_publicationversion = NEW.egcs_cn_publicationversion
          )
        );
      END IF;
      IF NOT hierarchy_valid THEN
        RAISE EXCEPTION 'Runtime item hierarchy is invalid'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeitemhierarchy';
      END IF;
      IF NOT reference_valid THEN
        RAISE EXCEPTION 'Runtime item version is not pinned by its parent publication version'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_runtimeitempublicationgraph';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_runtime_item_hierarchy
    AFTER INSERT ON "Common_Runtime_Item" DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_item_hierarchy()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_runtime_state_update() RETURNS trigger AS $$
    BEGIN
      IF current_setting('app.runtime_transition', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Runtime lifecycle changes require a transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionrequired';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['egcs_cn_state', 'egcs_cn_startedat', 'egcs_cn_updatedat', 'egcs_cn_completedat'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['egcs_cn_state', 'egcs_cn_startedat', 'egcs_cn_updatedat', 'egcs_cn_completedat']) THEN
        RAISE EXCEPTION 'Runtime identity, hierarchy, and publication pins are immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeidentityimmutable';
      END IF;
      IF OLD.egcs_cn_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
        AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'Terminal runtime state is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimeterminalimmutable';
      END IF;
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT (
        ${runtimeTransitionPredicate('OLD.egcs_cn_state', 'NEW.egcs_cn_state')}
      ) THEN
        RAISE EXCEPTION 'Invalid runtime transition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitiongraph';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_runtime_update
    BEFORE UPDATE ON "Common_Runtime"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_state_update()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_runtime_item_update
    BEFORE UPDATE ON "Common_Runtime_Item"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_runtime_state_update()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_apply_runtime_transition() RETURNS trigger AS $$
    DECLARE
      current_state varchar(32);
      transition_time timestamptz := now();
    BEGIN
      IF NEW.egcs_cn_runtimeitem IS NULL THEN
        SELECT egcs_cn_state INTO current_state FROM "Common_Runtime"
        WHERE id = NEW.egcs_cn_runtime FOR UPDATE;
      ELSE
        SELECT egcs_cn_state INTO current_state FROM "Common_Runtime_Item"
        WHERE id = NEW.egcs_cn_runtimeitem AND egcs_cn_runtime = NEW.egcs_cn_runtime FOR UPDATE;
      END IF;
      IF current_state IS NULL OR current_state <> NEW.egcs_cn_fromstate THEN
        RAISE EXCEPTION 'Runtime transition does not match the current state'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitioncurrent';
      END IF;
      PERFORM set_config('app.runtime_transition', 'on', true);
      IF NEW.egcs_cn_runtimeitem IS NULL THEN
        UPDATE "Common_Runtime" SET
          egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_startedat = CASE WHEN egcs_cn_startedat IS NULL AND NEW.egcs_cn_tostate IN ('active', 'awaiting_action', 'paused') THEN transition_time ELSE egcs_cn_startedat END,
          egcs_cn_updatedat = transition_time,
          egcs_cn_completedat = CASE WHEN NEW.egcs_cn_tostate IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN transition_time ELSE NULL END
        WHERE id = NEW.egcs_cn_runtime;
      ELSE
        UPDATE "Common_Runtime_Item" SET
          egcs_cn_state = NEW.egcs_cn_tostate,
          egcs_cn_startedat = CASE WHEN egcs_cn_startedat IS NULL AND NEW.egcs_cn_tostate IN ('active', 'awaiting_action', 'paused') THEN transition_time ELSE egcs_cn_startedat END,
          egcs_cn_updatedat = transition_time,
          egcs_cn_completedat = CASE WHEN NEW.egcs_cn_tostate IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN transition_time ELSE NULL END
        WHERE id = NEW.egcs_cn_runtimeitem;
      END IF;
      PERFORM set_config('app.runtime_transition', '', true);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_apply_runtime_transition
    BEFORE INSERT ON "Common_Runtime_Transition"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_apply_runtime_transition()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_runtime_transition() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime_Transition" transition
        WHERE transition.egcs_cn_runtime = NEW.egcs_cn_runtime
          AND transition.egcs_cn_runtimeitem = NEW.id
          AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
          AND transition.egcs_cn_tostate = NEW.egcs_cn_state
      ) THEN
        RAISE EXCEPTION 'Runtime item state changes require transition history'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionhistory';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_runtime_root_transition() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_state IS DISTINCT FROM OLD.egcs_cn_state AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime_Transition" transition
        WHERE transition.egcs_cn_runtime = NEW.id
          AND transition.egcs_cn_runtimeitem IS NULL
          AND transition.egcs_cn_fromstate = OLD.egcs_cn_state
          AND transition.egcs_cn_tostate = NEW.egcs_cn_state
      ) THEN
        RAISE EXCEPTION 'Runtime state changes require transition history'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_runtimetransitionhistory';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_require_runtime_transition
    AFTER UPDATE OF egcs_cn_state ON "Common_Runtime_Item"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_runtime_transition()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_require_runtime_root_transition
    AFTER UPDATE OF egcs_cn_state ON "Common_Runtime"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_runtime_root_transition()
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Review_Schema" (
      id bigint PRIMARY KEY,
      egcs_cn_publicationkind varchar(64) NOT NULL DEFAULT 'review_schema' CHECK (egcs_cn_publicationkind = 'review_schema'),
      egcs_cn_reviewtype "Review_Type" NOT NULL,
      egcs_cn_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
      egcs_cn_entitytype varchar(128) NOT NULL DEFAULT 'applicantrecipient',
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_outcomename_en varchar(255) NOT NULL,
      egcs_cn_outcomename_fr varchar(255) NOT NULL,
      egcs_cn_disablecustomoutcomes boolean NOT NULL DEFAULT false,
      egcs_cn_disablealignment boolean NOT NULL DEFAULT false,
      egcs_cn_disablereviewers boolean NOT NULL DEFAULT false,
      egcs_cn_scoringmatrix jsonb,
      egcs_cn_assessmentschema jsonb,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_ref_reviewschemapublication FOREIGN KEY (id, egcs_cn_publicationkind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewschemaagencynametypeen
    ON "Common_Review_Schema" (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewschemaagencynametypefr
    ON "Common_Review_Schema" (egcs_cn_agency, egcs_cn_entitytype, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_reviewschema_publication
    BEFORE INSERT ON "Common_Review_Schema"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('review_schema')
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Review_Schema"
      DROP CONSTRAINT IF EXISTS cn_chk_reviewschemaentitytype,
      ADD CONSTRAINT cn_ref_reviewschemaentitytype
      FOREIGN KEY (egcs_cn_entitytype) REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewschemaidentitytype
    ON "Common_Review_Schema" (id, egcs_cn_entitytype)
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewschemaidreviewtype
    ON "Common_Review_Schema" (id, egcs_cn_reviewtype)
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Assessment_Schema" (
      id bigserial PRIMARY KEY,
      egcs_cn_reviewschema bigint NOT NULL REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT,
      egcs_cn_scoringmatrix jsonb,
      egcs_cn_assessmentschema jsonb,
      egcs_cn_outcomename_en varchar(255) NOT NULL,
      egcs_cn_outcomename_fr varchar(255) NOT NULL,
      egcs_cn_disablecustomoutcomes boolean NOT NULL DEFAULT false,
      egcs_cn_disablealignment boolean NOT NULL DEFAULT false,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessmentschema_active_review
    ON "Common_Assessment_Schema" (egcs_cn_reviewschema)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Checklist_Schema" (
      id bigserial PRIMARY KEY,
      egcs_cn_reviewschema bigint NOT NULL REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT,
      egcs_cn_checklistschema jsonb,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_checklistschema_active_review
    ON "Common_Checklist_Schema" (egcs_cn_reviewschema)
    WHERE _deleted = false
  `.execute(db)

  await db.schema
    .createTable('Common_Review_Set_Setup')
    .ifNotExists()
    .addColumn('id', 'bigint', col => col.primaryKey())
    .addColumn('egcs_cn_publicationkind', 'varchar(64)', col => col.notNull().defaultTo('review_set_setup'))
    .addColumn('egcs_cn_scopetype', sql`varchar(128)`, col => col.notNull())
    .addColumn('egcs_cn_scopeid', 'bigint', col => col.notNull())
    .addColumn('egcs_cn_entitytype', sql`varchar(128)`, col => col.notNull())
    .addColumn('egcs_cn_name_en', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_name_fr', 'varchar(255)', col => col.notNull())
    .addColumn('egcs_cn_description_en', 'text', col => col.notNull().defaultTo(''))
    .addColumn('egcs_cn_description_fr', 'text', col => col.notNull().defaultTo(''))
    .addColumn('egcs_cn_order', 'smallint', col => col.notNull())
    .addColumn('egcs_cn_sequential', 'boolean', col => col.notNull())
    .addColumn('egcs_cn_approvaltemplate', 'bigint', col =>
      col.references('Common_Approval_Template.id').onDelete('restrict')
    )
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .addCheckConstraint(
      'cn_chk_reviewsetsetupscopetype',
      sql`egcs_cn_scopetype IN ('fundingopportunity', 'fundingcaseintake', 'fundingcaseagreement', 'applicantrecipient', 'transferpaymentstream')`
    )
    .addForeignKeyConstraint(
      'cn_ref_reviewsetsetupentitytype',
      ['egcs_cn_entitytype'],
      'Common_Entity_Type',
      ['egcs_cn_type']
    )
    .addCheckConstraint('cn_chk_reviewsetsetuppublicationkind', sql`egcs_cn_publicationkind = 'review_set_setup'`)
    .addForeignKeyConstraint(
      'cn_ref_reviewsetsetuppublication',
      ['id', 'egcs_cn_publicationkind'],
      'Common_Publication',
      ['id', 'egcs_cn_kind']
    )
    .execute()

  await sql`
    CREATE TRIGGER trg_register_reviewsetsetup_publication
    BEFORE INSERT ON "Common_Review_Set_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('review_set_setup')
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_direct_review_entity_type() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type.egcs_cn_supportsdirectreviews = true
          AND entity_type._deleted = false
      ) THEN
        RAISE EXCEPTION 'Entity type does not support direct Reviews'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_directreviewentitytype';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_review_schema_entity_type
    BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Review_Schema"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_direct_review_entity_type()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_review_set_setup_entity_type
    BEFORE INSERT OR UPDATE OF egcs_cn_entitytype ON "Common_Review_Set_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_direct_review_entity_type()
  `.execute(db)

  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_reviewsetsetupscopeidentitytypenameen
    ON "Common_Review_Set_Setup" (egcs_cn_scopeid, egcs_cn_entitytype, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_reviewsetsetupscopeidentitytypenamefr
    ON "Common_Review_Set_Setup" (egcs_cn_scopeid, egcs_cn_entitytype, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_reviewsetsetupscopeidentitytypeorder
    ON "Common_Review_Set_Setup" (egcs_cn_scopeid, egcs_cn_entitytype, egcs_cn_order)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewsetsetupidentitytype
    ON "Common_Review_Set_Setup" (id, egcs_cn_entitytype)
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Review_Set_Setup"
      DROP CONSTRAINT IF EXISTS cn_ref_reviewsetsetupscopeid,
      DROP CONSTRAINT IF EXISTS cn_ref_reviewsetsetupscopeidscopetype,
      ADD CONSTRAINT cn_ref_reviewsetsetupscopeidscopetype
      FOREIGN KEY (egcs_cn_scopeid, egcs_cn_scopetype)
      REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
  `.execute(db)

  await db.schema
    .createTable('Common_Review_Setup')
    .ifNotExists()
    .addColumn('id', 'bigserial', col => col.primaryKey())
    .addColumn('egcs_cn_entitytype', sql`varchar(128)`, col => col.notNull())
    .addColumn('egcs_cn_order', 'smallint', col => col.notNull())
    .addColumn('egcs_cn_reviewset', 'bigint', col => col.notNull())
    .addColumn('egcs_cn_approvaltemplate', 'bigint', col =>
      col.references('Common_Approval_Template.id').onDelete('restrict')
    )
    .addColumn('egcs_cn_reviewschema', 'bigint', col => col.notNull())
    .addColumn('egcs_cn_failonchecklistfailure', 'boolean', col => col.defaultTo(false).notNull())
    .addColumn('egcs_cn_failurethreshold', sql`numeric(10,2)`)
    .addColumn('_deleted', 'boolean', col => col.defaultTo(false).notNull())
    .execute()

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewsetupreviewsetorder
    ON "Common_Review_Setup" (egcs_cn_reviewset, egcs_cn_order)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewsetupreviewsetschema
    ON "Common_Review_Setup" (egcs_cn_reviewset, egcs_cn_reviewschema)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Review_Setup"
      DROP CONSTRAINT IF EXISTS common_review_setup_egcs_cn_reviewschema_foreign,
      DROP CONSTRAINT IF EXISTS cn_ref_reviewsetupreviewschemaentitytype,
      ADD CONSTRAINT cn_ref_reviewsetupreviewschemaentitytype
      FOREIGN KEY (egcs_cn_reviewschema, egcs_cn_entitytype)
      REFERENCES "Common_Review_Schema"(id, egcs_cn_entitytype)
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Review_Setup"
      DROP CONSTRAINT IF EXISTS cn_ref_reviewsetupreviewset,
      DROP CONSTRAINT IF EXISTS cn_ref_reviewsetupreviewsetentitytype,
      ADD CONSTRAINT cn_ref_reviewsetupreviewsetentitytype
      FOREIGN KEY (egcs_cn_reviewset, egcs_cn_entitytype)
      REFERENCES "Common_Review_Set_Setup"(id, egcs_cn_entitytype)
  `.execute(db)

  await sql`
    ALTER TABLE "Common_Approval_Template"
      ADD COLUMN IF NOT EXISTS egcs_cn_scopetype varchar(128),
      ADD COLUMN IF NOT EXISTS egcs_cn_scopeid bigint
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Approval_Template"
      ADD COLUMN IF NOT EXISTS egcs_cn_allowadditionalapprovals boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS egcs_cn_defaultaddedapprovalname_en varchar(255),
      ADD COLUMN IF NOT EXISTS egcs_cn_defaultaddedapprovalname_fr varchar(255),
      ADD COLUMN IF NOT EXISTS egcs_cn_allowaddedapprovalnamechanges boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS egcs_cn_allowaddedapprovalcertificationchanges boolean NOT NULL DEFAULT false,
      DROP CONSTRAINT IF EXISTS cn_chk_approvaltemplateadditionalapprovalnames,
      ADD CONSTRAINT cn_chk_approvaltemplateadditionalapprovalnames CHECK (
        egcs_cn_allowadditionalapprovals = false
        OR (
          NULLIF(BTRIM(egcs_cn_defaultaddedapprovalname_en), '') IS NOT NULL
          AND NULLIF(BTRIM(egcs_cn_defaultaddedapprovalname_fr), '') IS NOT NULL
        )
      )
  `.execute(db)

  await sql`
    ALTER TABLE "Common_Approval_Template"
      DROP CONSTRAINT IF EXISTS cn_chk_approvaltemplatescopetype,
      DROP CONSTRAINT IF EXISTS cn_ref_approvaltemplatescopeidscopetype,
      ALTER COLUMN egcs_cn_scopetype SET NOT NULL,
      ALTER COLUMN egcs_cn_scopeid SET NOT NULL,
      ADD CONSTRAINT cn_chk_approvaltemplatescopetype CHECK (egcs_cn_scopetype IN ('fundingopportunity', 'transferpaymentstream')),
      ADD CONSTRAINT cn_ref_approvaltemplatescopeidscopetype
      FOREIGN KEY (egcs_cn_scopeid, egcs_cn_scopetype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Review_Set" (
      id bigserial PRIMARY KEY,
      egcs_cn_reviewsetsetup bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_fk_reviewset_setup FOREIGN KEY (egcs_cn_reviewsetsetup, egcs_cn_entitytype)
      REFERENCES "Common_Review_Set_Setup"(id, egcs_cn_entitytype)
      ON DELETE RESTRICT,
      CONSTRAINT cn_ref_reviewsetentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
      REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
    )
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Review" (
      id bigint PRIMARY KEY,
      egcs_cn_helpers jsonb,
      egcs_cn_reviewresult numeric(10,2),
      egcs_cn_reviewset bigint NOT NULL REFERENCES "Common_Review_Set"(id) ON DELETE RESTRICT,
      egcs_cn_reviewschema bigint NOT NULL REFERENCES "Common_Review_Schema"(id) ON DELETE RESTRICT,
      egcs_cn_disablecustomoutcomes boolean NOT NULL DEFAULT false,
      egcs_cn_disablealignment boolean NOT NULL DEFAULT false,
      egcs_cn_disablereviewers boolean NOT NULL DEFAULT false,
      egcs_cn_failonchecklistfailure boolean NOT NULL DEFAULT false,
      egcs_cn_failurethreshold numeric(10,2),
      egcs_cn_reviewalignment boolean,
      egcs_cn_reviewalignresult numeric(10,2),
      egcs_cn_reviewalignmentnarrative text,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_reviewreviewresult
      CHECK (
        NOT (
          egcs_cn_reviewalignment = TRUE
          AND (
            egcs_cn_reviewalignmentnarrative IS NULL
            OR egcs_cn_reviewalignresult IS NULL
          )
        )
      )
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Assessment" (
      id bigserial PRIMARY KEY,
      egcs_cn_review bigint NOT NULL REFERENCES "Common_Review"(id) ON DELETE RESTRICT,
      egcs_cn_reviewresult numeric(10,2) NOT NULL,
      egcs_cn_disablecustomoutcomes boolean NOT NULL DEFAULT false,
      egcs_cn_disablealignment boolean NOT NULL DEFAULT false,
      egcs_cn_reviewalignment boolean,
      egcs_cn_reviewalignresult numeric(10,2),
      egcs_cn_reviewalignmentnarrative text,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_assessmentalignment CHECK (
        egcs_cn_reviewalignment IS DISTINCT FROM TRUE
        OR (egcs_cn_reviewalignmentnarrative IS NOT NULL AND egcs_cn_reviewalignresult IS NOT NULL)
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessment_active_review
    ON "Common_Assessment" (egcs_cn_review)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Checklist" (
      id bigserial PRIMARY KEY,
      egcs_cn_review bigint NOT NULL REFERENCES "Common_Review"(id) ON DELETE RESTRICT,
      egcs_cn_result "Checklist_Result",
      egcs_cn_evaluationtrace jsonb,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_checklist_active_review
    ON "Common_Checklist" (egcs_cn_review)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_review_subtype() RETURNS trigger AS $$
    DECLARE
      actual_type "Review_Type";
    BEGIN
      IF TG_TABLE_NAME IN ('Common_Assessment_Schema', 'Common_Checklist_Schema') THEN
        SELECT egcs_cn_reviewtype INTO actual_type
        FROM "Common_Review_Schema"
        WHERE id = NEW.egcs_cn_reviewschema;
      ELSE
        SELECT schema_record.egcs_cn_reviewtype INTO actual_type
        FROM "Common_Review" review_record
        INNER JOIN "Common_Review_Schema" schema_record
          ON schema_record.id = review_record.egcs_cn_reviewschema
        WHERE review_record.id = NEW.egcs_cn_review;
      END IF;

      IF actual_type IS DISTINCT FROM TG_ARGV[0]::"Review_Type" THEN
        RAISE EXCEPTION 'Review subtype % does not match schema type %', TG_ARGV[0], actual_type;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_assessment_schema_subtype ON "Common_Assessment_Schema"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_assessment_schema_subtype
    BEFORE INSERT OR UPDATE ON "Common_Assessment_Schema"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('assessment');
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_checklist_schema_subtype ON "Common_Checklist_Schema"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_checklist_schema_subtype
    BEFORE INSERT OR UPDATE ON "Common_Checklist_Schema"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('checklist');
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_assessment_subtype ON "Common_Assessment"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_assessment_subtype
    BEFORE INSERT OR UPDATE ON "Common_Assessment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('assessment');
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_checklist_subtype ON "Common_Checklist"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_checklist_subtype
    BEFORE INSERT OR UPDATE ON "Common_Checklist"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_review_subtype('checklist');
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Review"
      DROP CONSTRAINT IF EXISTS cn_ref_reviewid,
      ADD CONSTRAINT cn_ref_reviewid
      FOREIGN KEY (id)
      REFERENCES "Common_Entity"(id)
      ON DELETE RESTRICT
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_commonreview ON "Common_Review"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_commonreview
    BEFORE INSERT ON "Common_Review"
    FOR EACH ROW EXECUTE FUNCTION register_entity('commonreview');
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_commonreview_assignment_roster
    AFTER INSERT OR UPDATE OF _deleted ON "Common_Review"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonreview')
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_soft_delete_commonreview_assignments
    AFTER UPDATE OF _deleted ON "Common_Review" FOR EACH ROW
    EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('commonreview')
  `.execute(db)

  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_reviewset_entity
    ON "Common_Review_Set" (egcs_cn_reviewsetsetup, egcs_cn_entitytype, egcs_cn_entityid)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Review_Response" (
      id bigserial PRIMARY KEY,
      egcs_cn_section varchar(255) NOT NULL,
      egcs_cn_subsection varchar(255) NOT NULL,
      egcs_cn_question varchar(255) NOT NULL,
      egcs_cn_value numeric(10,2),
      egcs_cn_comment text NOT NULL,
      egcs_cn_calculated boolean NOT NULL DEFAULT false,
      egcs_cn_assessment bigint NOT NULL REFERENCES "Common_Review"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Assessment_Response" (
      id bigserial PRIMARY KEY,
      egcs_cn_assessment bigint NOT NULL REFERENCES "Common_Assessment"(id) ON DELETE RESTRICT,
      egcs_cn_section varchar(255) NOT NULL,
      egcs_cn_subsection varchar(255) NOT NULL,
      egcs_cn_question varchar(255) NOT NULL,
      egcs_cn_value numeric(10,2),
      egcs_cn_comment text NOT NULL DEFAULT '',
      egcs_cn_calculated boolean NOT NULL DEFAULT false,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessmentresponse_active_question
    ON "Common_Assessment_Response" (egcs_cn_assessment, egcs_cn_section, egcs_cn_subsection, egcs_cn_question)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Checklist_Response" (
      id bigserial PRIMARY KEY,
      egcs_cn_checklist bigint NOT NULL REFERENCES "Common_Checklist"(id) ON DELETE RESTRICT,
      egcs_cn_section varchar(255) NOT NULL,
      egcs_cn_question varchar(255) NOT NULL,
      egcs_cn_answer "Checklist_Answer" NOT NULL,
      egcs_cn_comment text NOT NULL DEFAULT '',
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_checklistresponse_active_question
    ON "Common_Checklist_Response" (egcs_cn_checklist, egcs_cn_section, egcs_cn_question)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Recommendation_Schema" (
      id bigint PRIMARY KEY,
      egcs_cn_publicationkind varchar(64) NOT NULL DEFAULT 'recommendation_schema' CHECK (egcs_cn_publicationkind = 'recommendation_schema'),
      egcs_cn_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_result jsonb NOT NULL,
      egcs_cn_recommendationschema jsonb NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_ref_recommendationschemapublication FOREIGN KEY (id, egcs_cn_publicationkind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_recommendationschemaagencynameen
    ON "Common_Recommendation_Schema" (egcs_cn_agency, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_recommendationschemaagencynamefr
    ON "Common_Recommendation_Schema" (egcs_cn_agency, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_recommendationschema_publication
    BEFORE INSERT ON "Common_Recommendation_Schema"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('recommendation_schema')
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Recommendation_Set_Setup" (
      id bigint PRIMARY KEY,
      egcs_cn_publicationkind varchar(64) NOT NULL DEFAULT 'recommendation_set_setup' CHECK (egcs_cn_publicationkind = 'recommendation_set_setup'),
      egcs_cn_scopetype varchar(128) NOT NULL,
      egcs_cn_scopeid bigint NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      egcs_cn_approvaltemplate bigint REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_recommendationsetsetupscopetype CHECK (egcs_cn_scopetype IN ('fundingopportunity', 'fundingcaseintake', 'fundingcaseagreement', 'applicantrecipient', 'transferpaymentstream')),
      CONSTRAINT cn_ref_recommendationsetsetupscopeidscopetype FOREIGN KEY (egcs_cn_scopeid, egcs_cn_scopetype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype),
      CONSTRAINT cn_ref_recommendationsetsetuppublication FOREIGN KEY (id, egcs_cn_publicationkind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind)
    )
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_recommendationsetsetup_publication
    BEFORE INSERT ON "Common_Recommendation_Set_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('recommendation_set_setup')
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_recommendationsetsetupscopeidnameen
    ON "Common_Recommendation_Set_Setup" (egcs_cn_scopeid, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_recommendationsetsetupscopeidnamefr
    ON "Common_Recommendation_Set_Setup" (egcs_cn_scopeid, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Recommendation_Setup" (
      id bigserial PRIMARY KEY,
      egcs_cn_order smallint NOT NULL,
      egcs_cn_recommendationset bigint NOT NULL,
      egcs_cn_approvaltemplate bigint REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      egcs_cn_recommendationschema bigint NOT NULL,
      egcs_cn_failonnotrecommended boolean NOT NULL DEFAULT false,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_ref_recommendationsetupset
        FOREIGN KEY (egcs_cn_recommendationset)
        REFERENCES "Common_Recommendation_Set_Setup"(id),
      CONSTRAINT cn_ref_recommendationsetupschema
        FOREIGN KEY (egcs_cn_recommendationschema)
        REFERENCES "Common_Recommendation_Schema"(id)
    )
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Recommendation_Set" (
      id bigserial PRIMARY KEY,
      egcs_cn_recommendationsetsetup bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_fk_recommendationset_setup FOREIGN KEY (egcs_cn_recommendationsetsetup)
        REFERENCES "Common_Recommendation_Set_Setup"(id) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_recommendationsetentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_recommendationset_identity
    ON "Common_Recommendation_Set" (id, egcs_cn_entitytype, egcs_cn_entityid)
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_recommendationset_entity
    ON "Common_Recommendation_Set" (egcs_cn_recommendationsetsetup, egcs_cn_entitytype, egcs_cn_entityid)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_recommendationsetupsetorder
    ON "Common_Recommendation_Setup" (egcs_cn_recommendationset, egcs_cn_order)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_recommendationsetupschema
    ON "Common_Recommendation_Setup" (egcs_cn_recommendationset, egcs_cn_recommendationschema)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_recommendation_setup_identity() RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_recommendationset IS DISTINCT FROM OLD.egcs_cn_recommendationset THEN
        RAISE EXCEPTION 'Recommendation setup set is immutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_recommendation_setup_identity
    BEFORE UPDATE OF egcs_cn_recommendationset ON "Common_Recommendation_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_recommendation_setup_identity()
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Setup" (
      id bigint PRIMARY KEY,
      egcs_cn_publicationkind varchar(64) NOT NULL DEFAULT 'workflow_setup' CHECK (egcs_cn_publicationkind = 'workflow_setup'),
      egcs_cn_scopetype varchar(128) NOT NULL,
      egcs_cn_scopeid bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      egcs_cn_purpose varchar(32) NOT NULL DEFAULT 'standard',
      egcs_cn_cancellationstatus bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_executionfailurestatus bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_allowretry boolean NOT NULL DEFAULT false,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_workflowsetuppurpose CHECK (egcs_cn_purpose IN ('standard', 'approval_submission', 'risk_rating')),
      CONSTRAINT cn_unq_workflowsetuptargetpurpose UNIQUE (id, egcs_cn_entitytype, egcs_cn_purpose),
      CONSTRAINT cn_ref_workflowsetupentitytype FOREIGN KEY (egcs_cn_entitytype)
        REFERENCES "Common_Entity_Type"(egcs_cn_type) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_workflowsetupscope FOREIGN KEY (egcs_cn_scopeid, egcs_cn_scopetype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype),
      CONSTRAINT cn_ref_workflowsetuppublication FOREIGN KEY (id, egcs_cn_publicationkind)
        REFERENCES "Common_Publication"(id, egcs_cn_kind)
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_runtime_definition() RETURNS trigger AS $$
    DECLARE
      runtime_id bigint;
      workflow_setup_id bigint;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Runtime' THEN
        IF NEW.egcs_cn_kind <> 'workflow' THEN RETURN NULL; END IF;
        runtime_id := NEW.id;
      ELSE
        workflow_setup_id := OLD.id;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "Common_Runtime" runtime
        WHERE runtime.egcs_cn_kind = 'workflow'
          AND (runtime_id IS NULL OR runtime.id = runtime_id)
          AND (workflow_setup_id IS NULL OR runtime.egcs_cn_sourcepublication = workflow_setup_id)
          AND NOT EXISTS (
            SELECT 1
            FROM "Common_Workflow_Setup" workflow
            JOIN "Common_Publication_Version" version
              ON version.id = runtime.egcs_cn_sourcepublicationversion
             AND version.egcs_cn_publication = workflow.id
             AND version.egcs_cn_kind = workflow.egcs_cn_publicationkind
             AND version.egcs_cn_version = runtime.egcs_cn_sourceversion
            WHERE workflow.id = runtime.egcs_cn_sourcepublication
              AND workflow.egcs_cn_publicationkind = runtime.egcs_cn_sourcepublicationkind
              AND workflow.egcs_cn_entitytype = runtime.egcs_cn_entitytype
              AND workflow.egcs_cn_purpose = runtime.egcs_cn_purpose
          )
      ) THEN
        RAISE EXCEPTION 'Workflow runtime source definition does not match its target type and purpose'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruntimedefinition';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_workflow_runtime_definition
    AFTER INSERT OR UPDATE OF
      egcs_cn_kind,
      egcs_cn_entitytype,
      egcs_cn_purpose,
      egcs_cn_sourcepublication,
      egcs_cn_sourcepublicationkind,
      egcs_cn_sourcepublicationversion,
      egcs_cn_sourceversion
    ON "Common_Runtime"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_definition()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_preserve_workflow_runtime_definition
    AFTER UPDATE OR DELETE ON "Common_Workflow_Setup"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_definition()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_setup_entity_type() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Common_Entity_Type" entity_type
        WHERE entity_type.egcs_cn_type = NEW.egcs_cn_entitytype
          AND entity_type._deleted = false
          AND (
            (NEW.egcs_cn_purpose = 'standard' AND entity_type.egcs_cn_standardworkflow = 'explicit')
            OR (NEW.egcs_cn_purpose = 'approval_submission' AND entity_type.egcs_cn_approvalsubmission <> 'none')
            OR (NEW.egcs_cn_purpose = 'risk_rating' AND entity_type.egcs_cn_riskrating = 'explicit')
          )
      ) THEN
        RAISE EXCEPTION 'Workflow target type is unavailable or incompatible with its declared purpose'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowsetupentitytype';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_workflow_setup_entity_type
    BEFORE INSERT OR UPDATE OF egcs_cn_entitytype, egcs_cn_purpose ON "Common_Workflow_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_setup_entity_type()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_register_workflowsetup_publication
    BEFORE INSERT ON "Common_Workflow_Setup"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_register_publication('workflow_setup')
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_preserve_retryable_workflow_status() RETURNS trigger AS $$
    BEGIN
      IF NOT OLD._deleted AND NEW._deleted AND EXISTS (
        SELECT 1
        FROM "Common_Workflow_Publication_Status" pinned_status
        JOIN "Common_Publication_Version" version
          ON version.id = pinned_status.egcs_cn_publicationversion
        JOIN "Common_Runtime" runtime
          ON runtime.egcs_cn_sourcepublicationversion = version.id
         AND runtime.egcs_cn_sourcepublication = version.egcs_cn_publication
         AND runtime.egcs_cn_kind = 'workflow'
        WHERE pinned_status.egcs_cn_status = OLD.id
          AND runtime._deleted = false
          AND (
            runtime.egcs_cn_state IN ('pending', 'active', 'awaiting_action', 'paused')
            OR (
              runtime.egcs_cn_state IN ('unsuccessful', 'denied', 'cancelled', 'failed')
              AND NOT EXISTS (
                SELECT 1
                FROM "Common_Runtime" newer_runtime
                WHERE newer_runtime.egcs_cn_kind = 'workflow'
                  AND newer_runtime.egcs_cn_entitytype = runtime.egcs_cn_entitytype
                  AND newer_runtime.egcs_cn_entityid = runtime.egcs_cn_entityid
                  AND newer_runtime.egcs_cn_purpose = runtime.egcs_cn_purpose
                  AND newer_runtime.id > runtime.id
                  AND newer_runtime._deleted = false
              )
              AND COALESCE((version.egcs_cn_definition ->> 'allowRetry')::boolean, false)
            )
          )
      ) THEN
        RAISE EXCEPTION 'Statuses pinned by retryable workflow attempts cannot be deleted'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_status_retryableworkflowreference';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_preserve_retryable_workflow_status
    BEFORE UPDATE OF _deleted ON "Common_Status"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_preserve_retryable_workflow_status()
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Setup_Allowed_Start_Status" (
      id bigserial PRIMARY KEY,
      egcs_cn_workflowsetup bigint NOT NULL REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_status bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_order smallint NOT NULL CHECK (egcs_cn_order > 0),
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowallowedstartstatus
    ON "Common_Workflow_Setup_Allowed_Start_Status" (egcs_cn_workflowsetup, egcs_cn_status)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowallowedstartorder
    ON "Common_Workflow_Setup_Allowed_Start_Status" (egcs_cn_workflowsetup, egcs_cn_order)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_workflowsetup_scope_entity
    ON "Common_Workflow_Setup" (egcs_cn_scopetype, egcs_cn_scopeid, egcs_cn_entitytype, egcs_cn_purpose)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Setup_Member" (
      id bigserial PRIMARY KEY,
      egcs_cn_workflowsetup bigint NOT NULL REFERENCES "Common_Workflow_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_sequence integer NOT NULL CHECK (egcs_cn_sequence > 0),
      egcs_cn_kind varchar(32) NOT NULL CHECK (egcs_cn_kind IN ('review_set', 'recommendation_set', 'approval_template')),
      egcs_cn_reviewset bigint REFERENCES "Common_Review_Set_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_recommendationset bigint REFERENCES "Common_Recommendation_Set_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_approvaltemplate bigint REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      egcs_cn_materializationstatus bigint REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_successstatus bigint REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_failurestatus bigint REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_allowownerredirect boolean NOT NULL DEFAULT false,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_workflowsetupmemberreference CHECK (
        (egcs_cn_reviewset IS NOT NULL)::integer
        + (egcs_cn_recommendationset IS NOT NULL)::integer
        + (egcs_cn_approvaltemplate IS NOT NULL)::integer = 1
        AND (egcs_cn_kind = 'review_set') = (egcs_cn_reviewset IS NOT NULL)
        AND (egcs_cn_kind = 'recommendation_set') = (egcs_cn_recommendationset IS NOT NULL)
        AND (egcs_cn_kind = 'approval_template') = (egcs_cn_approvaltemplate IS NOT NULL)
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowsetupmembersequence
    ON "Common_Workflow_Setup_Member" (egcs_cn_workflowsetup, egcs_cn_sequence)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_setup_member() RETURNS trigger AS $$
    DECLARE workflow "Common_Workflow_Setup"%ROWTYPE;
    BEGIN
      SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup AND _deleted = false;
      IF NOT FOUND THEN RAISE EXCEPTION 'Workflow setup is unavailable'; END IF;
      IF NEW.egcs_cn_reviewset IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Review_Set_Setup" candidate
        WHERE candidate.id = NEW.egcs_cn_reviewset AND candidate.egcs_cn_scopetype = workflow.egcs_cn_scopetype
          AND candidate.egcs_cn_scopeid = workflow.egcs_cn_scopeid AND candidate.egcs_cn_entitytype = workflow.egcs_cn_entitytype
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow review set scope or entity type mismatch'; END IF;
      IF NEW.egcs_cn_recommendationset IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Recommendation_Set_Setup" candidate
        WHERE candidate.id = NEW.egcs_cn_recommendationset AND candidate.egcs_cn_scopetype = workflow.egcs_cn_scopetype
          AND candidate.egcs_cn_scopeid = workflow.egcs_cn_scopeid
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow recommendation set scope mismatch'; END IF;
      IF NEW.egcs_cn_approvaltemplate IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Approval_Template" candidate
        WHERE candidate.id = NEW.egcs_cn_approvaltemplate AND candidate.egcs_cn_scopetype = workflow.egcs_cn_scopetype
          AND candidate.egcs_cn_scopeid = workflow.egcs_cn_scopeid
          AND candidate._deleted = false
          AND EXISTS (SELECT 1 FROM "Common_Publication" publication
            WHERE publication.id = candidate.id AND publication.egcs_cn_state = 'published' AND publication._deleted = false)
      ) THEN RAISE EXCEPTION 'Workflow approval template scope mismatch'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    DROP TRIGGER IF EXISTS trg_validate_workflow_setup_member ON "Common_Workflow_Setup_Member"
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_workflow_setup_member
    BEFORE INSERT OR UPDATE ON "Common_Workflow_Setup_Member"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_setup_member()
  `.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_status_agency() RETURNS trigger AS $$
    DECLARE
      workflow "Common_Workflow_Setup"%ROWTYPE;
      resolved_agency bigint;
      configured_status bigint;
      configured_statuses bigint[];
    BEGIN
      IF TG_TABLE_NAME = 'Common_Workflow_Setup' THEN
        workflow := NEW;
        configured_statuses := ARRAY[NEW.egcs_cn_cancellationstatus, NEW.egcs_cn_executionfailurestatus];
      ELSIF TG_TABLE_NAME = 'Common_Workflow_Setup_Allowed_Start_Status' THEN
        SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup;
        configured_statuses := ARRAY[NEW.egcs_cn_status];
      ELSE
        SELECT * INTO workflow FROM "Common_Workflow_Setup" WHERE id = NEW.egcs_cn_workflowsetup;
        configured_statuses := ARRAY[
          NEW.egcs_cn_materializationstatus,
          NEW.egcs_cn_successstatus,
          NEW.egcs_cn_failurestatus
        ];
      END IF;

      IF NOT FOUND AND TG_TABLE_NAME <> 'Common_Workflow_Setup' THEN
        RAISE EXCEPTION 'Workflow setup is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
      END IF;

      IF workflow.egcs_cn_scopetype <> 'transferpaymentstream' THEN
        RAISE EXCEPTION 'Agency status workflows require a transfer-payment Stream scope'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
      END IF;

      SELECT profile.egcs_tp_agency INTO resolved_agency
      FROM "Transfer_Payment_Stream" stream
      JOIN "Transfer_Payment_Profile" profile
        ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE stream.id = workflow.egcs_cn_scopeid
        AND stream._deleted = false
        AND profile._deleted = false;

      IF resolved_agency IS NULL THEN
        RAISE EXCEPTION 'Workflow Stream Agency could not be resolved'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
      END IF;

      FOREACH configured_status IN ARRAY configured_statuses LOOP
        IF configured_status IS NOT NULL THEN
          PERFORM 1
          FROM "Common_Status"
          WHERE id = configured_status
            AND egcs_cn_agency = resolved_agency
            AND _deleted = false
          FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Workflow status does not belong to the resolved Agency'
              USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowstatusagency';
          END IF;
        END IF;
      END LOOP;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_workflow_setup_status_agency
    AFTER INSERT OR UPDATE ON "Common_Workflow_Setup"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_workflow_allowed_status_agency
    AFTER INSERT OR UPDATE ON "Common_Workflow_Setup_Allowed_Start_Status"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_workflow_member_status_agency
    AFTER INSERT OR UPDATE ON "Common_Workflow_Setup_Member"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_status_agency()
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Setup_Member_Owner" (
      id bigserial PRIMARY KEY,
      egcs_cn_workflowsetupmember bigint NOT NULL REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT,
      egcs_cn_reviewsetup bigint REFERENCES "Common_Review_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_recommendationsetup bigint REFERENCES "Common_Recommendation_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_defaultowner bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_workflowmemberownerreference CHECK (
        (egcs_cn_reviewsetup IS NOT NULL)::integer + (egcs_cn_recommendationsetup IS NOT NULL)::integer = 1
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowmemberownerreview
    ON "Common_Workflow_Setup_Member_Owner" (egcs_cn_workflowsetupmember, egcs_cn_reviewsetup)
    WHERE _deleted = false AND egcs_cn_reviewsetup IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowmemberownerrecommendation
    ON "Common_Workflow_Setup_Member_Owner" (egcs_cn_workflowsetupmember, egcs_cn_recommendationsetup)
    WHERE _deleted = false AND egcs_cn_recommendationsetup IS NOT NULL
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_member_owner() RETURNS trigger AS $$
    DECLARE workflow_member "Common_Workflow_Setup_Member"%ROWTYPE;
    BEGIN
      SELECT * INTO workflow_member FROM "Common_Workflow_Setup_Member"
      WHERE id = NEW.egcs_cn_workflowsetupmember AND _deleted = false;
      IF NOT FOUND THEN RAISE EXCEPTION 'Workflow member is unavailable'; END IF;
      IF NEW.egcs_cn_reviewsetup IS NOT NULL AND (
        workflow_member.egcs_cn_kind <> 'review_set' OR NOT EXISTS (
          SELECT 1 FROM "Common_Review_Setup" nested
          WHERE nested.id = NEW.egcs_cn_reviewsetup AND nested.egcs_cn_reviewset = workflow_member.egcs_cn_reviewset AND nested._deleted = false
        )
      ) THEN RAISE EXCEPTION 'Workflow review owner mapping does not belong to the configured set'; END IF;
      IF NEW.egcs_cn_recommendationsetup IS NOT NULL AND (
        workflow_member.egcs_cn_kind <> 'recommendation_set' OR NOT EXISTS (
          SELECT 1 FROM "Common_Recommendation_Setup" nested
          WHERE nested.id = NEW.egcs_cn_recommendationsetup AND nested.egcs_cn_recommendationset = workflow_member.egcs_cn_recommendationset AND nested._deleted = false
        )
      ) THEN RAISE EXCEPTION 'Workflow recommendation owner mapping does not belong to the configured set'; END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    DROP TRIGGER IF EXISTS trg_validate_workflow_member_owner ON "Common_Workflow_Setup_Member_Owner"
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_workflow_member_owner
    BEFORE INSERT OR UPDATE ON "Common_Workflow_Setup_Member_Owner"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_member_owner()
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Run" (
      id bigint PRIMARY KEY REFERENCES "Common_Runtime"(id) ON DELETE RESTRICT,
      egcs_cn_completion bigint
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_runtime_extension() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM "Common_Runtime" runtime WHERE runtime.id = NEW.id AND runtime.egcs_cn_kind = 'workflow') THEN
        RAISE EXCEPTION 'Workflow extension requires a workflow runtime'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruntimekind';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_workflow_runtime_extension
    BEFORE INSERT OR UPDATE OF id ON "Common_Workflow_Run"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_runtime_extension()
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Recommendation" (
      id bigint PRIMARY KEY,
      egcs_cn_recommendationset bigint NOT NULL REFERENCES "Common_Recommendation_Set"(id) ON DELETE RESTRICT,
      egcs_cn_recommendationsetup bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_recommendation smallint,
      egcs_cn_response jsonb NOT NULL DEFAULT '{"responses":[]}'::jsonb,
      egcs_cn_resultoptionkey varchar(255),
      egcs_cn_outcome varchar(32),
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_recommendationoutcome CHECK (egcs_cn_outcome IS NULL OR egcs_cn_outcome IN ('recommended', 'not_recommended')),
      CONSTRAINT cn_ref_recommendationid FOREIGN KEY (id) REFERENCES "Common_Entity"(id) ON DELETE RESTRICT,
      CONSTRAINT cn_ref_recommendationsetruntimeidentity FOREIGN KEY (egcs_cn_recommendationset, egcs_cn_entitytype, egcs_cn_entityid)
        REFERENCES "Common_Recommendation_Set"(id, egcs_cn_entitytype, egcs_cn_entityid),
      CONSTRAINT cn_ref_recommendationentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype) REFERENCES "Common_Entity"(id, egcs_cn_entitytype),
      CONSTRAINT cn_ref_recommendationrecommendationsetup FOREIGN KEY (egcs_cn_recommendationsetup) REFERENCES "Common_Recommendation_Setup"(id)
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_recommendation_runtime_member() RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM "Common_Recommendation_Set" runtime_set
        JOIN "Common_Recommendation_Setup" member
          ON member.id = NEW.egcs_cn_recommendationsetup
        WHERE runtime_set.id = NEW.egcs_cn_recommendationset
          AND member.egcs_cn_recommendationset = runtime_set.egcs_cn_recommendationsetsetup
      ) THEN
        RAISE EXCEPTION 'Recommendation runtime member does not belong to its recommendation set setup';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_recommendation_runtime_member
    BEFORE INSERT OR UPDATE OF egcs_cn_recommendationset, egcs_cn_recommendationsetup ON "Common_Recommendation"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_recommendation_runtime_member()
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_commonrecommendation ON "Common_Recommendation"`.execute(db)
  await sql`
    CREATE TRIGGER trg_register_commonrecommendation
    BEFORE INSERT ON "Common_Recommendation"
    FOR EACH ROW EXECUTE FUNCTION register_entity('commonrecommendation')
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_commonrecommendation_assignment_roster
    AFTER INSERT OR UPDATE OF _deleted ON "Common_Recommendation"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_assignable_entity_roster('commonrecommendation')
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_soft_delete_commonrecommendation_assignments
    AFTER UPDATE OF _deleted ON "Common_Recommendation" FOR EACH ROW
    EXECUTE FUNCTION trg_fn_soft_delete_entity_assignments('commonrecommendation')
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Attachment_Types" (
      id bigserial PRIMARY KEY,
      egcs_cn_agency bigint NOT NULL REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_attachmenttypesagencynameen
    ON "Common_Attachment_Types" (egcs_cn_agency, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_attachmenttypesagencynamefr
    ON "Common_Attachment_Types" (egcs_cn_agency, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Attachment" (
      id bigserial PRIMARY KEY,
      egcs_cn_attachmenttype bigint NOT NULL REFERENCES "Common_Attachment_Types"(id) ON DELETE RESTRICT,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      egcs_cn_filename varchar(255) NOT NULL,
      egcs_cn_provider varchar(120) NOT NULL,
      egcs_cn_providerobjectid varchar(512) NOT NULL,
      egcs_cn_providerlocator jsonb NOT NULL,
      egcs_cn_providermetadata jsonb,
      egcs_cn_metadatapersistence varchar(16),
      egcs_cn_metadatacontractversion integer,
      egcs_cn_mimetype text NOT NULL,
      egcs_cn_createdat timestamptz NOT NULL,
      egcs_cn_filesize bigint NOT NULL,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_attachmentfilesize CHECK (egcs_cn_filesize >= 0),
      CONSTRAINT cn_chk_attachmentlocatorjson CHECK (
        jsonb_typeof(egcs_cn_providerlocator) = 'object'
        AND pg_column_size(egcs_cn_providerlocator) <= 32768
      ),
      CONSTRAINT cn_chk_attachmentmetadatajson CHECK (
        egcs_cn_providermetadata IS NULL
        OR (jsonb_typeof(egcs_cn_providermetadata) = 'object' AND pg_column_size(egcs_cn_providermetadata) <= 16384)
      ),
      CONSTRAINT cn_chk_attachmentmetadatacontract CHECK (
        (egcs_cn_providermetadata IS NULL AND egcs_cn_metadatapersistence IS NULL AND egcs_cn_metadatacontractversion IS NULL)
        OR (egcs_cn_providermetadata IS NOT NULL AND egcs_cn_metadatapersistence = 'host' AND egcs_cn_metadatacontractversion > 0)
        OR (egcs_cn_providermetadata IS NULL AND egcs_cn_metadatapersistence = 'provider' AND egcs_cn_metadatacontractversion > 0)
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_attachmentproviderobject
    ON "Common_Attachment" (egcs_cn_provider, egcs_cn_providerobjectid)
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Entity_Attachment" (
      id bigserial PRIMARY KEY,
      egcs_cn_attachment bigint NOT NULL REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_uploadedby bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_updatedat timestamptz,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_fk_entityattachment_entity FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
        REFERENCES "Common_Entity"(id, egcs_cn_entitytype) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_entityattachment_attachment
    ON "Common_Entity_Attachment" (egcs_cn_attachment)
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_entity_attachment_identity_immutable()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.egcs_cn_attachment IS DISTINCT FROM OLD.egcs_cn_attachment
        OR NEW.egcs_cn_entityid IS DISTINCT FROM OLD.egcs_cn_entityid
        OR NEW.egcs_cn_entitytype IS DISTINCT FROM OLD.egcs_cn_entitytype
        OR NEW.egcs_cn_uploadedby IS DISTINCT FROM OLD.egcs_cn_uploadedby THEN
        RAISE EXCEPTION 'Attachment business context is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_entity_attachment_identity_immutable
    BEFORE UPDATE ON "Common_Entity_Attachment"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_entity_attachment_identity_immutable()
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_entityattachment_activetarget
    ON "Common_Entity_Attachment" (egcs_cn_entitytype, egcs_cn_entityid, id)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Transfer_Payment_Stream_Document_Template" (
      id bigserial PRIMARY KEY,
      egcs_tp_transferpaymentstream bigint NOT NULL REFERENCES "Transfer_Payment_Stream"(id) ON DELETE RESTRICT,
      egcs_tp_entitytype varchar(128) NOT NULL,
      egcs_tp_name_en varchar(255) NOT NULL,
      egcs_tp_name_fr varchar(255) NOT NULL,
      egcs_tp_description_en text NOT NULL,
      egcs_tp_description_fr text NOT NULL,
      egcs_tp_templateattachment_en bigint NOT NULL REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT,
      egcs_tp_templateattachment_fr bigint NOT NULL REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT,
      egcs_tp_templatekind varchar(16) NOT NULL,
      egcs_tp_outputformats jsonb NOT NULL DEFAULT '["docx"]'::jsonb,
      egcs_tp_active boolean NOT NULL DEFAULT true,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT tp_chk_documenttemplate_entitytype CHECK (egcs_tp_entitytype IN ('fundingcaseagreement', 'fundingcaseagreementcloseout')),
      CONSTRAINT tp_chk_documenttemplate_kind CHECK (egcs_tp_templatekind IN ('docx', 'html')),
      CONSTRAINT tp_chk_documenttemplate_outputs CHECK (
        jsonb_typeof(egcs_tp_outputformats) = 'array'
        AND jsonb_array_length(egcs_tp_outputformats) > 0
        AND egcs_tp_outputformats <@ '["docx", "html", "pdf"]'::jsonb
      ),
      CONSTRAINT tp_chk_documenttemplate_kindoutput CHECK (
        (egcs_tp_templatekind = 'docx' AND egcs_tp_outputformats <@ '["docx", "pdf"]'::jsonb)
        OR (egcs_tp_templatekind = 'html' AND egcs_tp_outputformats <@ '["html", "pdf"]'::jsonb)
      )
    )
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS tp_idx_streamdocumenttemplate_entity
    ON "Transfer_Payment_Stream_Document_Template" (
      egcs_tp_transferpaymentstream,
      egcs_tp_entitytype,
      id
    )
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_approvaltemplatescopenametypeen
    ON "Common_Approval_Template" (egcs_cn_scopeid, egcs_cn_scopetype, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_approvaltemplatescopenametypefr
    ON "Common_Approval_Template" (egcs_cn_scopeid, egcs_cn_scopetype, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_reviewreviewset
    ON "Common_Review" (egcs_cn_reviewset)
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_reviewresponseassessmentsectionsubsectionquestion
    ON "Common_Review_Response" (egcs_cn_assessment, egcs_cn_section, egcs_cn_subsection, egcs_cn_question)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Completion" (
      id bigserial PRIMARY KEY,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_comments text,
      egcs_cn_user bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_disposition varchar(32) NOT NULL,
      egcs_cn_completedat timestamptz NOT NULL DEFAULT now(),
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_completionnotdeleted CHECK (_deleted = false),
      CONSTRAINT cn_chk_completiondisposition CHECK (
        egcs_cn_disposition IN (${sql.join(COMPLETION_DISPOSITIONS.map(value => sql.lit(value)))})
      ),
      CONSTRAINT cn_uq_completionidentity UNIQUE (id, egcs_cn_entitytype, egcs_cn_entityid),
      CONSTRAINT cn_ref_completionentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
      REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_completionentitytypeentityid
    ON "Common_Completion" (egcs_cn_entitytype, egcs_cn_entityid)
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_completion_insert() RETURNS trigger AS $$
    DECLARE entity_definition "Common_Entity_Type"%ROWTYPE;
    BEGIN
      SELECT * INTO entity_definition FROM "Common_Entity_Type"
      WHERE egcs_cn_type = NEW.egcs_cn_entitytype AND _deleted = false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Completion entity type is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionentitytype';
      END IF;
      IF NEW.egcs_cn_entitytype = 'commonreview' THEN
        IF NEW.egcs_cn_disposition <> 'not_applicable' THEN
          RAISE EXCEPTION 'Review completion does not select a business Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completiondispositiontype';
        END IF;
      ELSIF entity_definition.egcs_cn_completion <> 'supported'
        OR NEW.egcs_cn_disposition = 'not_applicable' THEN
        RAISE EXCEPTION 'Entity type does not support completion-driven transitions'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionentitytype';
      ELSIF NEW.egcs_cn_entitytype IN ('fundingcaseamendment', 'fundingcaseagreementcloseout')
        AND NEW.egcs_cn_disposition <> 'workflow_started' THEN
        RAISE EXCEPTION 'Entity requires an approval-submission Workflow at Completion'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowrequired';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_completion_insert
    BEFORE INSERT ON "Common_Completion"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_completion_insert()
  `.execute(db)
  await sql`
    ALTER TABLE "Common_Workflow_Run"
    ADD CONSTRAINT cn_ref_workflowruncompletiontarget
    FOREIGN KEY (egcs_cn_completion)
    REFERENCES "Common_Completion" (id)
    ON DELETE RESTRICT
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_completion_target() RETURNS trigger AS $$
    DECLARE previous_completion bigint;
    BEGIN
      IF NEW.egcs_cn_completion IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Runtime" runtime
        JOIN "Common_Completion" completion ON completion.id = NEW.egcs_cn_completion
        WHERE runtime.id = NEW.id
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) =
              (completion.egcs_cn_entitytype, completion.egcs_cn_entityid)
      ) THEN
        RAISE EXCEPTION 'Workflow completion does not belong to its runtime target'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowruncompletiontarget';
      END IF;
      IF NEW.egcs_cn_completion IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "Common_Completion" completion
        WHERE completion.id = NEW.egcs_cn_completion
          AND completion.egcs_cn_disposition = 'workflow_started'
      ) THEN
        RAISE EXCEPTION 'Workflow completion link requires workflow_started disposition'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowcompletiondisposition';
      END IF;
      SELECT previous_run.egcs_cn_completion INTO previous_completion
      FROM "Common_Runtime" runtime
      JOIN "Common_Workflow_Run" previous_run ON previous_run.id = runtime.egcs_cn_previousruntime
      WHERE runtime.id = NEW.id;
      IF FOUND AND NEW.egcs_cn_completion IS DISTINCT FROM previous_completion THEN
        RAISE EXCEPTION 'Workflow retry must retain its completion evidence link'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowretrycompletion';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_completion_resolution() RETURNS trigger AS $$
    DECLARE completion_ids bigint[]; completion_id bigint; completion_disposition varchar(32); initial_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Completion' THEN
        completion_ids := ARRAY[NEW.id];
      ELSIF TG_OP = 'DELETE' THEN
        completion_ids := ARRAY[OLD.egcs_cn_completion];
      ELSIF TG_OP = 'INSERT' THEN
        completion_ids := ARRAY[NEW.egcs_cn_completion];
      ELSE
        completion_ids := ARRAY(
          SELECT DISTINCT value
          FROM unnest(ARRAY[NEW.egcs_cn_completion, OLD.egcs_cn_completion]) AS value
          WHERE value IS NOT NULL
        );
      END IF;
      FOREACH completion_id IN ARRAY completion_ids LOOP
        CONTINUE WHEN completion_id IS NULL;
        SELECT egcs_cn_disposition INTO completion_disposition
        FROM "Common_Completion" WHERE id = completion_id;
        CONTINUE WHEN NOT FOUND;
        SELECT count(*) INTO initial_count
        FROM "Common_Workflow_Run" run
        JOIN "Common_Runtime" runtime ON runtime.id = run.id
        WHERE run.egcs_cn_completion = completion_id
          AND runtime.egcs_cn_previousruntime IS NULL
          AND runtime._deleted = false;
        IF completion_disposition = 'workflow_started' AND initial_count <> 1 THEN
          RAISE EXCEPTION 'workflow_started Completion requires exactly one linked initial Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowlink';
        ELSIF completion_disposition IN ('no_workflow', 'not_applicable') AND initial_count <> 0 THEN
          RAISE EXCEPTION 'Completion disposition rejects a linked initial Workflow'
            USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completionworkflowlink';
        END IF;
      END LOOP;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_completion_resolution_from_completion
    AFTER INSERT ON "Common_Completion"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_completion_resolution()
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_completion_resolution_from_workflow
    AFTER INSERT OR UPDATE OF egcs_cn_completion OR DELETE ON "Common_Workflow_Run"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_completion_resolution()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_workflow_transition_mode() RETURNS trigger AS $$
    DECLARE entity_definition "Common_Entity_Type"%ROWTYPE; linked_disposition varchar(32);
    BEGIN
      IF NEW.egcs_cn_kind <> 'workflow' OR NEW.egcs_cn_previousruntime IS NOT NULL THEN RETURN NULL; END IF;
      SELECT * INTO entity_definition FROM "Common_Entity_Type"
      WHERE egcs_cn_type = NEW.egcs_cn_entitytype AND _deleted = false;
      SELECT completion.egcs_cn_disposition INTO linked_disposition
      FROM "Common_Workflow_Run" run
      JOIN "Common_Completion" completion ON completion.id = run.egcs_cn_completion
      WHERE run.id = NEW.id;
      IF entity_definition.egcs_cn_type IS NULL THEN
        RAISE EXCEPTION 'Workflow entity type is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'standard'
        AND (entity_definition.egcs_cn_standardworkflow <> 'explicit' OR linked_disposition IS NOT NULL) THEN
        RAISE EXCEPTION 'Standard Workflow requires explicit support and cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'explicit'
        AND linked_disposition IS NOT NULL THEN
        RAISE EXCEPTION 'Explicit approval submission cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'on_completion'
        AND linked_disposition IS DISTINCT FROM 'workflow_started' THEN
        RAISE EXCEPTION 'Completion-driven approval submission requires linked Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'approval_submission'
        AND entity_definition.egcs_cn_approvalsubmission = 'none' THEN
        RAISE EXCEPTION 'Entity type does not support approval submission'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose = 'risk_rating'
        AND (entity_definition.egcs_cn_riskrating <> 'explicit' OR linked_disposition IS NOT NULL) THEN
        RAISE EXCEPTION 'Risk Rating Workflow requires explicit support and cannot link Completion evidence'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      ELSIF NEW.egcs_cn_purpose NOT IN ('standard', 'approval_submission', 'risk_rating') THEN
        RAISE EXCEPTION 'Workflow purpose is unsupported'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_workflowtransitionmode';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_enforce_workflow_transition_mode
    AFTER INSERT ON "Common_Runtime"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_workflow_transition_mode()
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_workflow_completion_target
    BEFORE INSERT OR UPDATE OF egcs_cn_completion ON "Common_Workflow_Run"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_completion_target()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_completion() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Completion evidence is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_completion_immutable';
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_completion ON "Common_Completion"`.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_completion
    BEFORE UPDATE OR DELETE ON "Common_Completion"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_completion();
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Additional_Reviewers" (
      id bigserial PRIMARY KEY,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_comments text,
      egcs_cn_user bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_completedat timestamptz,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_additionalreviewersentitytype CHECK (egcs_cn_entitytype NOT IN ('fundingopportunity', 'fundingcaseintake', 'fundingcaseagreement', 'applicantrecipient', 'transferpaymentstream')),
      CONSTRAINT cn_ref_additionalreviewersentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
      REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
    )
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_additionalreviewersentitytypeentityid
    ON "Common_Additional_Reviewers" (egcs_cn_entitytype, egcs_cn_entityid)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_reset_additional_reviewer_completion() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.egcs_cn_user IS DISTINCT FROM OLD.egcs_cn_user THEN
        NEW.egcs_cn_completedat := NULL;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_reset_additional_reviewer_completion ON "Common_Additional_Reviewers"`.execute(db)
  await sql`
    CREATE TRIGGER trg_reset_additional_reviewer_completion
    BEFORE INSERT OR UPDATE ON "Common_Additional_Reviewers"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_reset_additional_reviewer_completion();
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Approval_Step" (
      id bigserial PRIMARY KEY,
      egcs_cn_sequence integer NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_approvaltemplate bigint NOT NULL REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      egcs_cn_defaultuser bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_approvertitle varchar(255) NOT NULL,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_approvalstepapprovaltemplatenameen
    ON "Common_Approval_Step" (egcs_cn_approvaltemplate, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_approvalstepapprovaltemplatenamefr
    ON "Common_Approval_Step" (egcs_cn_approvaltemplate, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Routing_Slip" (
      id bigserial PRIMARY KEY,
      egcs_cn_entitytype varchar(128) NOT NULL,
      egcs_cn_entityid bigint NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_approvaltemplate bigint NOT NULL REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      egcs_cn_allowadditionalapprovals boolean NOT NULL DEFAULT false,
      egcs_cn_defaultaddedapprovalname_en varchar(255),
      egcs_cn_defaultaddedapprovalname_fr varchar(255),
      egcs_cn_allowaddedapprovalnamechanges boolean NOT NULL DEFAULT false,
      egcs_cn_allowaddedapprovalcertificationchanges boolean NOT NULL DEFAULT false,
      egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_ref_routingslipentityidentitytype FOREIGN KEY (egcs_cn_entityid, egcs_cn_entitytype)
      REFERENCES "Common_Entity"(id, egcs_cn_entitytype)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Status_Transition" (
      id bigserial PRIMARY KEY,
      egcs_cn_workflowrun bigint NOT NULL REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT,
      egcs_cn_workflowitem bigint,
      egcs_cn_event varchar(32) NOT NULL CHECK (egcs_cn_event IN ('materialized', 'succeeded', 'failed', 'cancelled', 'execution_failed')),
      egcs_cn_previousstatus bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_newstatus bigint NOT NULL REFERENCES "Common_Status"(id) ON DELETE RESTRICT,
      egcs_cn_actor bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cn_ref_workflowtransitionitemrun
        FOREIGN KEY (egcs_cn_workflowitem, egcs_cn_workflowrun)
        REFERENCES "Common_Runtime_Item" (id, egcs_cn_runtime) ON DELETE RESTRICT
    )
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_workflow_transition_status_agency() RETURNS trigger AS $$
    DECLARE
      resolved_agency bigint;
      previous_status_agency bigint;
      next_status_agency bigint;
    BEGIN
      SELECT profile.egcs_tp_agency INTO resolved_agency
      FROM "Common_Workflow_Run" run
      JOIN "Common_Runtime" runtime ON runtime.id = run.id
      JOIN "Common_Workflow_Setup" workflow ON workflow.id = runtime.egcs_cn_sourcepublication
      JOIN "Transfer_Payment_Stream" stream
        ON workflow.egcs_cn_scopetype = 'transferpaymentstream'
        AND stream.id = workflow.egcs_cn_scopeid
      JOIN "Transfer_Payment_Profile" profile
        ON profile.id = stream.egcs_tp_transferpaymentprofile
      WHERE run.id = NEW.egcs_cn_workflowrun;

      IF resolved_agency IS NULL THEN
        RAISE EXCEPTION 'Workflow transition Agency could not be resolved'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowtransitionstatusagency';
      END IF;

      PERFORM 1
      FROM "Common_Status"
      WHERE id IN (NEW.egcs_cn_previousstatus, NEW.egcs_cn_newstatus)
        AND _deleted = false
      ORDER BY id
      FOR UPDATE;

      SELECT egcs_cn_agency INTO previous_status_agency
      FROM "Common_Status"
      WHERE id = NEW.egcs_cn_previousstatus
        AND _deleted = false;
      SELECT egcs_cn_agency INTO next_status_agency
      FROM "Common_Status"
      WHERE id = NEW.egcs_cn_newstatus
        AND _deleted = false;

      IF previous_status_agency IS DISTINCT FROM resolved_agency
        OR next_status_agency IS DISTINCT FROM resolved_agency THEN
        RAISE EXCEPTION 'Workflow transition status does not belong to the resolved Agency'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_workflowtransitionstatusagency';
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE CONSTRAINT TRIGGER trg_validate_workflow_transition_status_agency
    AFTER INSERT ON "Common_Workflow_Status_Transition"
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_workflow_transition_status_agency()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_workflow_status_transition() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Workflow status transition history is immutable'; END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    DROP TRIGGER IF EXISTS trg_lock_workflow_status_transition ON "Common_Workflow_Status_Transition"
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_workflow_status_transition
    BEFORE UPDATE OR DELETE ON "Common_Workflow_Status_Transition"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_workflow_status_transition()
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Workflow_Owner_Blocker" (
      id bigserial PRIMARY KEY,
      egcs_cn_workflowrun bigint NOT NULL REFERENCES "Common_Workflow_Run"(id) ON DELETE RESTRICT,
      egcs_cn_workflowsetupmember bigint NOT NULL REFERENCES "Common_Workflow_Setup_Member"(id) ON DELETE RESTRICT,
      egcs_cn_reviewsetup bigint REFERENCES "Common_Review_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_recommendationsetup bigint REFERENCES "Common_Recommendation_Setup"(id) ON DELETE RESTRICT,
      egcs_cn_configuredowner bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_reason varchar(64) NOT NULL,
      egcs_cn_triggeredby bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_replacementowner bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_resolvedby bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_createdat timestamptz NOT NULL DEFAULT now(),
      egcs_cn_resolvedat timestamptz,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_workflowownerblockermember CHECK (
        (egcs_cn_reviewsetup IS NOT NULL)::integer + (egcs_cn_recommendationsetup IS NOT NULL)::integer = 1
      ),
      CONSTRAINT cn_chk_workflowownerblockerresolution CHECK (
        (egcs_cn_resolvedat IS NULL AND egcs_cn_replacementowner IS NULL AND egcs_cn_resolvedby IS NULL)
        OR (egcs_cn_resolvedat IS NOT NULL AND egcs_cn_replacementowner IS NOT NULL AND egcs_cn_resolvedby IS NOT NULL)
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowownerblocker_active_review
    ON "Common_Workflow_Owner_Blocker" (egcs_cn_workflowrun, egcs_cn_workflowsetupmember, egcs_cn_reviewsetup)
    WHERE _deleted = false AND egcs_cn_resolvedat IS NULL AND egcs_cn_reviewsetup IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_workflowownerblocker_active_recommendation
    ON "Common_Workflow_Owner_Blocker" (egcs_cn_workflowrun, egcs_cn_workflowsetupmember, egcs_cn_recommendationsetup)
    WHERE _deleted = false AND egcs_cn_resolvedat IS NULL AND egcs_cn_recommendationsetup IS NOT NULL
  `.execute(db)
  await sql`ALTER TABLE "Common_Review_Set" ADD COLUMN egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Review" ADD COLUMN egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Recommendation_Set" ADD COLUMN egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT`.execute(db)
  await sql`ALTER TABLE "Common_Recommendation" ADD COLUMN egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_domain_runtime_extension() RETURNS trigger AS $$
    DECLARE valid boolean := false;
    BEGIN
      IF TG_TABLE_NAME = 'Common_Review_Set' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'review_set'
          AND item.egcs_cn_parentruntimeitem IS NULL AND item.egcs_cn_publication = NEW.egcs_cn_reviewsetsetup
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) = (NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid)
          AND runtime.egcs_cn_kind IN ('workflow', 'review_set');
      ELSIF TG_TABLE_NAME = 'Common_Review' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item
        JOIN "Common_Review_Set" runtime_set ON runtime_set.id = NEW.egcs_cn_reviewset
        JOIN "Common_Runtime_Item" set_item ON set_item.id = runtime_set.egcs_cn_runtimeitem
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'review'
          AND item.egcs_cn_runtime = set_item.egcs_cn_runtime
          AND item.egcs_cn_parentruntimeitem = set_item.id
          AND item.egcs_cn_publication = NEW.egcs_cn_reviewschema;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation_Set' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'recommendation_set'
          AND item.egcs_cn_parentruntimeitem IS NULL AND item.egcs_cn_publication = NEW.egcs_cn_recommendationsetsetup
          AND (runtime.egcs_cn_entitytype, runtime.egcs_cn_entityid) = (NEW.egcs_cn_entitytype, NEW.egcs_cn_entityid)
          AND runtime.egcs_cn_kind = 'workflow';
      ELSIF TG_TABLE_NAME = 'Common_Recommendation' THEN
        SELECT true INTO valid FROM "Common_Runtime_Item" item
        JOIN "Common_Recommendation_Set" runtime_set ON runtime_set.id = NEW.egcs_cn_recommendationset
        JOIN "Common_Runtime_Item" set_item ON set_item.id = runtime_set.egcs_cn_runtimeitem
        JOIN "Common_Recommendation_Setup" member ON member.id = NEW.egcs_cn_recommendationsetup
        WHERE item.id = NEW.egcs_cn_runtimeitem AND item.egcs_cn_kind = 'recommendation'
          AND item.egcs_cn_runtime = set_item.egcs_cn_runtime
          AND item.egcs_cn_parentruntimeitem = set_item.id
          AND item.egcs_cn_publication = member.egcs_cn_recommendationschema;
      END IF;
      IF valid IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Domain runtime extension does not match its typed runtime item'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_domainruntimeitem';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_validate_reviewset_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Review_Set" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension()`.execute(db)
  await sql`CREATE TRIGGER trg_validate_review_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension()`.execute(db)
  await sql`CREATE TRIGGER trg_validate_recommendationset_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Recommendation_Set" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension()`.execute(db)
  await sql`CREATE TRIGGER trg_validate_recommendation_runtime_extension BEFORE INSERT OR UPDATE ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_domain_runtime_extension()`.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Certification" (
      id bigserial PRIMARY KEY,
      egcs_cn_order smallint NOT NULL,
      egcs_cn_description_en text NOT NULL,
      egcs_cn_description_fr text NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_optional boolean,
      egcs_cn_certification_en text NOT NULL,
      egcs_cn_certification_fr text NOT NULL,
      egcs_cn_approvalstep bigint REFERENCES "Common_Approval_Step"(id) ON DELETE RESTRICT,
      egcs_cn_approvaltemplate bigint REFERENCES "Common_Approval_Template"(id) ON DELETE RESTRICT,
      egcs_cn_routingslip bigint REFERENCES "Common_Routing_Slip"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false,
      CONSTRAINT cn_chk_certificationowner CHECK (
        (egcs_cn_approvalstep IS NOT NULL)::integer
        + (egcs_cn_approvaltemplate IS NOT NULL)::integer
        + (egcs_cn_routingslip IS NOT NULL)::integer = 1
      )
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovalsteporder
    ON "Common_Certification" (egcs_cn_approvalstep, egcs_cn_order)
    WHERE _deleted = false AND egcs_cn_approvalstep IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovalstepnameen
    ON "Common_Certification" (egcs_cn_approvalstep, egcs_cn_name_en)
    WHERE _deleted = false AND egcs_cn_approvalstep IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovalstepnamefr
    ON "Common_Certification" (egcs_cn_approvalstep, egcs_cn_name_fr)
    WHERE _deleted = false AND egcs_cn_approvalstep IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovaltemplateorder
    ON "Common_Certification" (egcs_cn_approvaltemplate, egcs_cn_order)
    WHERE _deleted = false AND egcs_cn_approvaltemplate IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovaltemplatenameen
    ON "Common_Certification" (egcs_cn_approvaltemplate, egcs_cn_name_en)
    WHERE _deleted = false AND egcs_cn_approvaltemplate IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationapprovaltemplatenamefr
    ON "Common_Certification" (egcs_cn_approvaltemplate, egcs_cn_name_fr)
    WHERE _deleted = false AND egcs_cn_approvaltemplate IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationroutingsliporder
    ON "Common_Certification" (egcs_cn_routingslip, egcs_cn_order)
    WHERE _deleted = false AND egcs_cn_routingslip IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationroutingslipnameen
    ON "Common_Certification" (egcs_cn_routingslip, egcs_cn_name_en)
    WHERE _deleted = false AND egcs_cn_routingslip IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_certificationroutingslipnamefr
    ON "Common_Certification" (egcs_cn_routingslip, egcs_cn_name_fr)
    WHERE _deleted = false AND egcs_cn_routingslip IS NOT NULL
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_routingslip_target_evidence
    ON "Common_Routing_Slip" (egcs_cn_entitytype, egcs_cn_entityid, id DESC)
    WHERE _deleted = false
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Approval" (
      id bigserial PRIMARY KEY,
      egcs_cn_runtimeitem bigint NOT NULL UNIQUE REFERENCES "Common_Runtime_Item"(id) ON DELETE RESTRICT,
      egcs_cn_sequence decimal NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_routingslip bigint NOT NULL REFERENCES "Common_Routing_Slip"(id) ON DELETE RESTRICT,
      egcs_cn_defaultuser bigint NOT NULL REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_assigneduser bigint REFERENCES "Common_User"(id) ON DELETE RESTRICT,
      egcs_cn_onbehalf bigint REFERENCES "Agency_Approval_Behalf_Type"(id) ON DELETE RESTRICT,
      egcs_cn_approvalpositiontitle text,
      egcs_cn_isadded boolean NOT NULL,
      egcs_cn_approvalvalue boolean,
      egcs_cn_approvaldate timestamptz,
      egcs_cn_attachment bigint REFERENCES "Common_Attachment"(id) ON DELETE RESTRICT,
      egcs_cn_comment text,
      CONSTRAINT cn_chk_approvalapprovalvalueapprovalpositiontitlenull
      CHECK (NOT (egcs_cn_approvalpositiontitle IS NULL AND egcs_cn_approvalvalue IS NOT NULL)),
      CONSTRAINT cn_chk_approvaldefaultuserassigneduseronbehalfnull
      CHECK (NOT (egcs_cn_defaultuser <> egcs_cn_assigneduser AND egcs_cn_onbehalf IS NULL)),
      CONSTRAINT cn_chk_approvalassigneduseronbehalfapprovalpositiontitlenotnull
      CHECK (NOT (egcs_cn_defaultuser = egcs_cn_assigneduser AND egcs_cn_onbehalf IS NOT NULL))
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_approvalroutingslipsequence
    ON "Common_Approval" (egcs_cn_routingslip, egcs_cn_sequence)
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Approval_Certification" (
      id bigserial PRIMARY KEY,
      egcs_cn_optional boolean NOT NULL,
      egcs_cn_certification_en text NOT NULL,
      egcs_cn_certification_fr text NOT NULL,
      egcs_cn_value boolean,
      egcs_cn_approval bigint NOT NULL REFERENCES "Common_Approval"(id) ON DELETE RESTRICT
    )
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Assessment_Outcome" (
      id bigserial PRIMARY KEY,
      egcs_cn_review bigint NOT NULL REFERENCES "Common_Review"(id) ON DELETE RESTRICT,
      egcs_cn_section varchar(255) NOT NULL,
      egcs_cn_subsection varchar(255) NOT NULL,
      egcs_cn_name_en varchar(255) NOT NULL,
      egcs_cn_name_fr varchar(255) NOT NULL,
      egcs_cn_recommendedstrategy text NOT NULL,
      egcs_cn_accepted boolean NOT NULL,
      egcs_cn_selectedstrategy varchar(255) NOT NULL,
      egcs_cn_justification text,
      egcs_cn_comment text NOT NULL,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessmentoutcomereviewnameen
    ON "Common_Assessment_Outcome" (egcs_cn_review, egcs_cn_name_en)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessmentoutcomereviewnamefr
    ON "Common_Assessment_Outcome" (egcs_cn_review, egcs_cn_name_fr)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS "Common_Assessment_Custom_Outcome" (
      id bigserial PRIMARY KEY,
      egcs_cn_name varchar(255) NOT NULL,
      egcs_cn_outcome text NOT NULL,
      egcs_cn_review bigint NOT NULL REFERENCES "Common_Review"(id) ON DELETE RESTRICT,
      _deleted boolean NOT NULL DEFAULT false
    )
  `.execute(db)
  await sql`
    CREATE INDEX IF NOT EXISTS cn_idx_assessmentcustomoutcomereview
    ON "Common_Assessment_Custom_Outcome" (egcs_cn_review)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_assessmentcustomoutcomenamereview
    ON "Common_Assessment_Custom_Outcome" (egcs_cn_name, egcs_cn_review)
    WHERE _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_actioned_approval() RETURNS trigger AS $$
    BEGIN
      IF OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify approval %: already actioned with value %',
          OLD.id, OLD.egcs_cn_approvalvalue;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_approval_sequence() RETURNS trigger AS $$
    DECLARE
      incomplete_prior integer;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RETURN NEW;
      END IF;

      SELECT COUNT(*) INTO incomplete_prior
      FROM "Common_Approval"
      WHERE egcs_cn_routingslip = NEW.egcs_cn_routingslip
        AND egcs_cn_sequence < NEW.egcs_cn_sequence
        AND egcs_cn_approvalvalue IS DISTINCT FROM true;

      IF incomplete_prior > 0 THEN
        RAISE EXCEPTION 'Cannot action approval %: % prior step(s) are incomplete or denied',
          NEW.id, incomplete_prior;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_certifications() RETURNS trigger AS $$
    DECLARE
      uncertified_count integer;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS DISTINCT FROM true THEN
        RETURN NEW;
      END IF;

      SELECT COUNT(*) INTO uncertified_count
      FROM "Common_Approval_Certification"
      WHERE egcs_cn_approval = NEW.id
        AND egcs_cn_optional = false
        AND egcs_cn_value IS DISTINCT FROM true;

      IF uncertified_count > 0 THEN
        RAISE EXCEPTION 'Cannot approve %: % non-optional certification(s) not yet attested',
          NEW.id, uncertified_count;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_assigned_user_actions() RETURNS trigger AS $$
    DECLARE
      session_user_id bigint;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NOT DISTINCT FROM OLD.egcs_cn_approvalvalue THEN
        RETURN NEW;
      END IF;

      session_user_id := NULLIF(current_setting('app.current_user_id', true), '')::bigint;
      IF session_user_id IS NULL OR session_user_id <> NEW.egcs_cn_assigneduser THEN
        RAISE EXCEPTION 'Only the assigned user may action approval %', NEW.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_autopopulate_self_approval() RETURNS trigger AS $$
    DECLARE
      user_position_title text;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.egcs_cn_defaultuser <> NEW.egcs_cn_assigneduser THEN
        RETURN NEW;
      END IF;

      SELECT egcs_cn_position_title INTO user_position_title
      FROM "Common_User"
      WHERE id = NEW.egcs_cn_assigneduser;

      NEW.egcs_cn_approvaldate := NOW();
      NEW.egcs_cn_approvalpositiontitle := user_position_title;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_require_actual_delegation_detail() RETURNS trigger AS $$
    DECLARE
      requires_actual boolean;
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NULL OR OLD.egcs_cn_approvalvalue IS NOT NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.egcs_cn_onbehalf IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT egcs_ay_require_actual INTO requires_actual
      FROM "Agency_Approval_Behalf_Type"
      WHERE id = NEW.egcs_cn_onbehalf;

      IF requires_actual = true AND (
        NEW.egcs_cn_approvalpositiontitle IS NULL
        OR NEW.egcs_cn_approvaldate IS NULL
      ) THEN
        RAISE EXCEPTION 'Approval % requires full delegation detail (position title, date)',
          NEW.id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_actioned_approval ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_actioned_approval
    BEFORE UPDATE ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_lock_actioned_approval();
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_approval_sequence ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_approval_sequence
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_approval_sequence();
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_require_certifications ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_require_certifications
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_require_certifications();
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_assigned_user_actions ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_assigned_user_actions
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_enforce_assigned_user_actions();
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_autopopulate_self_approval ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_autopopulate_self_approval
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_autopopulate_self_approval();
  `.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_require_actual_delegation_detail ON "Common_Approval"`.execute(db)
  await sql`
    CREATE TRIGGER trg_require_actual_delegation_detail
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_require_actual_delegation_detail();
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cn_idx_runtimeitem_currentapprovalstep
    ON "Common_Runtime_Item" (egcs_cn_parentruntimeitem)
    WHERE egcs_cn_kind = 'approval_step' AND egcs_cn_state = 'awaiting_action' AND _deleted = false
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_routing_slip_runtime() RETURNS trigger AS $$
    DECLARE
      item_row "Common_Runtime_Item"%ROWTYPE;
      runtime_row "Common_Runtime"%ROWTYPE;
    BEGIN
      SELECT * INTO item_row FROM "Common_Runtime_Item" WHERE id = NEW.egcs_cn_runtimeitem FOR UPDATE;
      IF NOT FOUND
        OR item_row._deleted
        OR item_row.egcs_cn_kind <> 'routing_slip'
        OR item_row.egcs_cn_publicationkind <> 'approval_template'
        OR item_row.egcs_cn_publication <> NEW.egcs_cn_approvaltemplate THEN
        RAISE EXCEPTION 'Routing slip runtime item does not match its pinned approval template'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_routingslipruntimeitem';
      END IF;
      SELECT * INTO runtime_row FROM "Common_Runtime" WHERE id = item_row.egcs_cn_runtime FOR UPDATE;
      IF NOT FOUND OR runtime_row._deleted THEN
        RAISE EXCEPTION 'Routing slip runtime is unavailable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_routingslipruntimeitem';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM "Common_Routing_Slip" slip
        JOIN "Common_Runtime_Item" existing_item ON existing_item.id = slip.egcs_cn_runtimeitem
        WHERE slip.egcs_cn_entitytype = NEW.egcs_cn_entitytype
          AND slip.egcs_cn_entityid = NEW.egcs_cn_entityid
          AND slip.id <> NEW.id
          AND slip._deleted = false
          AND existing_item._deleted = false
          AND existing_item.egcs_cn_state NOT IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
      ) THEN
        RAISE EXCEPTION 'An active approval routing slip already exists for this entity'
          USING ERRCODE = '23505', CONSTRAINT = 'cn_ref_routingslipactiveruntime';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_routing_slip_runtime
    BEFORE INSERT OR UPDATE ON "Common_Routing_Slip"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_routing_slip_runtime()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_approval_runtime_item() RETURNS trigger AS $$
    DECLARE
      approval_item "Common_Runtime_Item"%ROWTYPE;
      routing_item "Common_Runtime_Item"%ROWTYPE;
    BEGIN
      SELECT * INTO approval_item FROM "Common_Runtime_Item" WHERE id = NEW.egcs_cn_runtimeitem FOR UPDATE;
      SELECT item.* INTO routing_item
      FROM "Common_Routing_Slip" slip
      JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem
      WHERE slip.id = NEW.egcs_cn_routingslip
      FOR UPDATE OF item;
      IF approval_item.id IS NULL OR routing_item.id IS NULL
        OR approval_item._deleted OR routing_item._deleted
        OR approval_item.egcs_cn_kind <> 'approval_step'
        OR approval_item.egcs_cn_parentruntimeitem <> routing_item.id
        OR approval_item.egcs_cn_runtime <> routing_item.egcs_cn_runtime
        OR (approval_item.egcs_cn_publication, approval_item.egcs_cn_publicationkind,
            approval_item.egcs_cn_publicationversion, approval_item.egcs_cn_version)
          IS DISTINCT FROM
           (routing_item.egcs_cn_publication, routing_item.egcs_cn_publicationkind,
            routing_item.egcs_cn_publicationversion, routing_item.egcs_cn_version) THEN
        RAISE EXCEPTION 'Approval step runtime item does not match its routing slip'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_ref_approvalruntimeitem';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_approval_runtime_item
    BEFORE INSERT OR UPDATE ON "Common_Approval"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_approval_runtime_item()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_enforce_approval_runtime_state() RETURNS trigger AS $$
    DECLARE
      approval_state varchar(32);
      routing_state varchar(32);
    BEGIN
      IF NEW.egcs_cn_approvalvalue IS NOT DISTINCT FROM OLD.egcs_cn_approvalvalue THEN RETURN NEW; END IF;
      SELECT approval_item.egcs_cn_state, routing_item.egcs_cn_state
      INTO approval_state, routing_state
      FROM "Common_Runtime_Item" approval_item
      JOIN "Common_Routing_Slip" slip ON slip.id = NEW.egcs_cn_routingslip
      JOIN "Common_Runtime_Item" routing_item ON routing_item.id = slip.egcs_cn_runtimeitem
      WHERE approval_item.id = NEW.egcs_cn_runtimeitem
      FOR UPDATE OF approval_item, routing_item;
      IF approval_state <> 'awaiting_action' OR routing_state <> 'awaiting_action' THEN
        RAISE EXCEPTION 'Only the current awaiting approval step may be actioned'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalruntimeactionstate';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_enforce_approval_runtime_state
    BEFORE UPDATE OF egcs_cn_approvalvalue ON "Common_Approval"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_enforce_approval_runtime_state()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_approval_runtime_evidence() RETURNS trigger AS $$
    DECLARE
      approval_state varchar(32);
      routing_state varchar(32);
    BEGIN
      SELECT approval_item.egcs_cn_state, routing_item.egcs_cn_state
      INTO approval_state, routing_state
      FROM "Common_Runtime_Item" approval_item
      JOIN "Common_Routing_Slip" slip ON slip.id = OLD.egcs_cn_routingslip
      JOIN "Common_Runtime_Item" routing_item ON routing_item.id = slip.egcs_cn_runtimeitem
      WHERE approval_item.id = OLD.egcs_cn_runtimeitem;
      IF approval_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed')
        OR routing_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Terminal approval evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalterminalimmutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_approval_runtime_evidence
    BEFORE UPDATE OR DELETE ON "Common_Approval"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_approval_runtime_evidence()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_approval_certification_evidence() RETURNS trigger AS $$
    DECLARE approval_value boolean;
    BEGIN
      SELECT egcs_cn_approvalvalue INTO approval_value FROM "Common_Approval" WHERE id = OLD.egcs_cn_approval;
      IF approval_value IS NOT NULL THEN
        RAISE EXCEPTION 'Actioned approval certification evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_approvalcertificationimmutable';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_lock_approval_certification_evidence
    BEFORE UPDATE OR DELETE ON "Common_Approval_Certification"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_approval_certification_evidence()
  `.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_lock_terminal_runtime_evidence() RETURNS trigger AS $$
    DECLARE evidence_row record; runtime_state varchar(32);
    BEGIN
      IF TG_OP = 'INSERT' THEN evidence_row := NEW; ELSE evidence_row := OLD; END IF;
      IF TG_TABLE_NAME = 'Common_Routing_Slip' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      ELSIF TG_TABLE_NAME = 'Common_Certification' THEN
        IF evidence_row.egcs_cn_routingslip IS NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Routing_Slip" slip
          JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem WHERE slip.id = evidence_row.egcs_cn_routingslip;
      ELSIF TG_TABLE_NAME = 'Common_Review' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      ELSIF TG_TABLE_NAME IN ('Common_Assessment', 'Common_Checklist', 'Common_Assessment_Outcome', 'Common_Assessment_Custom_Outcome') THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Review" review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE review.id = evidence_row.egcs_cn_review;
      ELSIF TG_TABLE_NAME = 'Common_Review_Response' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Assessment" assessment
          JOIN "Common_Review" review ON review.id = assessment.egcs_cn_review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE assessment.id = evidence_row.egcs_cn_assessment;
      ELSIF TG_TABLE_NAME = 'Common_Checklist_Response' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Checklist" checklist
          JOIN "Common_Review" review ON review.id = checklist.egcs_cn_review
          JOIN "Common_Runtime_Item" item ON item.id = review.egcs_cn_runtimeitem
          WHERE checklist.id = evidence_row.egcs_cn_checklist;
      ELSIF TG_TABLE_NAME = 'Common_Recommendation' THEN
        SELECT item.egcs_cn_state INTO runtime_state FROM "Common_Runtime_Item" item WHERE item.id = evidence_row.egcs_cn_runtimeitem;
      END IF;
      IF runtime_state IN ('succeeded', 'approved', 'unsuccessful', 'denied', 'cancelled', 'failed') THEN
        RAISE EXCEPTION 'Terminal runtime evidence is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_terminalruntimeevidenceimmutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_routing_slip BEFORE INSERT OR UPDATE OR DELETE ON "Common_Routing_Slip" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_routing_certification BEFORE INSERT OR UPDATE OR DELETE ON "Common_Certification" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_review BEFORE INSERT OR UPDATE OR DELETE ON "Common_Review" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_assessment BEFORE INSERT OR UPDATE OR DELETE ON "Common_Assessment" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_checklist BEFORE INSERT OR UPDATE OR DELETE ON "Common_Checklist" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_review_response BEFORE INSERT OR UPDATE OR DELETE ON "Common_Review_Response" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_checklist_response BEFORE INSERT OR UPDATE OR DELETE ON "Common_Checklist_Response" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_assessment_outcome BEFORE INSERT OR UPDATE OR DELETE ON "Common_Assessment_Outcome" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_assessment_custom_outcome BEFORE INSERT OR UPDATE OR DELETE ON "Common_Assessment_Custom_Outcome" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)
  await sql`CREATE TRIGGER trg_lock_terminal_recommendation BEFORE INSERT OR UPDATE OR DELETE ON "Common_Recommendation" FOR EACH ROW EXECUTE FUNCTION trg_fn_lock_terminal_runtime_evidence()`.execute(db)

  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_guard_publication_authoring() RETURNS trigger AS $$
    DECLARE authoring_row record; publication_id bigint; publication_state varchar(32);
    BEGIN
      IF TG_OP = 'INSERT' THEN authoring_row := NEW; ELSE authoring_row := OLD; END IF;
      IF TG_ARGV[0] = 'publication' THEN
        publication_id := authoring_row.id;
      ELSIF TG_ARGV[0] = 'approval_step' THEN
        publication_id := authoring_row.egcs_cn_approvaltemplate;
      ELSIF TG_ARGV[0] = 'certification' THEN
        IF authoring_row.egcs_cn_routingslip IS NOT NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END IF;
        publication_id := authoring_row.egcs_cn_approvaltemplate;
        IF publication_id IS NULL THEN
          SELECT egcs_cn_approvaltemplate INTO publication_id FROM "Common_Approval_Step" WHERE id = authoring_row.egcs_cn_approvalstep;
        END IF;
      ELSIF TG_ARGV[0] = 'review_schema_child' THEN
        publication_id := authoring_row.egcs_cn_reviewschema;
      ELSIF TG_ARGV[0] = 'review_set_child' THEN
        publication_id := authoring_row.egcs_cn_reviewset;
      ELSIF TG_ARGV[0] = 'recommendation_set_child' THEN
        publication_id := authoring_row.egcs_cn_recommendationset;
      ELSIF TG_ARGV[0] = 'workflow_child' THEN
        publication_id := authoring_row.egcs_cn_workflowsetup;
      ELSIF TG_ARGV[0] = 'workflow_owner' THEN
        SELECT egcs_cn_workflowsetup INTO publication_id FROM "Common_Workflow_Setup_Member" WHERE id = authoring_row.egcs_cn_workflowsetupmember;
      END IF;
      SELECT egcs_cn_state INTO publication_state FROM "Common_Publication" WHERE id = publication_id;
      IF publication_state = 'retired' THEN
        RAISE EXCEPTION 'Retired publication authoring data is immutable'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_retiredpublicationimmutable';
      END IF;
      IF TG_ARGV[0] = 'publication' AND TG_OP = 'UPDATE' AND OLD._deleted = true AND NEW._deleted = false THEN
        RAISE EXCEPTION 'Deleted publication authoring rows cannot be restored'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_publicationnorestore';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  for (const table of ['Common_Approval_Template', 'Common_Review_Schema', 'Common_Review_Set_Setup', 'Common_Recommendation_Schema', 'Common_Recommendation_Set_Setup', 'Common_Workflow_Setup']) {
    await sql.raw(`CREATE TRIGGER trg_guard_publication_authoring BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('publication')`).execute(db)
  }
  await sql`CREATE TRIGGER trg_guard_approval_step_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Approval_Step" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('approval_step')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_certification_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Certification" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('certification')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_assessment_schema_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Assessment_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_schema_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_checklist_schema_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Checklist_Schema" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_schema_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_review_setup_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Review_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('review_set_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_recommendation_setup_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Recommendation_Setup" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('recommendation_set_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_workflow_status_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Workflow_Setup_Allowed_Start_Status" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_workflow_member_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Workflow_Setup_Member" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_child')`.execute(db)
  await sql`CREATE TRIGGER trg_guard_workflow_owner_authoring BEFORE INSERT OR UPDATE OR DELETE ON "Common_Workflow_Setup_Member_Owner" FOR EACH ROW EXECUTE FUNCTION trg_fn_guard_publication_authoring('workflow_owner')`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION trg_fn_validate_added_approval_runtime_step() RETURNS trigger AS $$
    DECLARE routing_state varchar(32); allows_additional boolean; max_actioned decimal;
      retry_source bigint; is_exact_retry_clone boolean;
    BEGIN
      IF NEW.egcs_cn_isadded = false THEN RETURN NEW; END IF;
      SELECT item.egcs_cn_state, slip.egcs_cn_allowadditionalapprovals, runtime.egcs_cn_previousruntime
      INTO routing_state, allows_additional, retry_source
      FROM "Common_Routing_Slip" slip
      JOIN "Common_Runtime_Item" item ON item.id = slip.egcs_cn_runtimeitem
      JOIN "Common_Runtime" runtime ON runtime.id = item.egcs_cn_runtime
      WHERE slip.id = NEW.egcs_cn_routingslip AND slip._deleted = false;
      IF routing_state = 'pending' AND retry_source IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM "Common_Runtime_Item" new_step
          JOIN "Common_Runtime_Item" new_routing ON new_routing.id = new_step.egcs_cn_parentruntimeitem
          LEFT JOIN "Common_Runtime_Item" new_parent ON new_parent.id = new_routing.egcs_cn_parentruntimeitem
          JOIN "Common_Runtime_Item" old_routing
            ON old_routing.egcs_cn_runtime = retry_source
           AND old_routing.egcs_cn_kind = 'routing_slip'
           AND old_routing.egcs_cn_order = new_routing.egcs_cn_order
           AND old_routing.egcs_cn_publicationversion = new_routing.egcs_cn_publicationversion
          LEFT JOIN "Common_Runtime_Item" old_parent ON old_parent.id = old_routing.egcs_cn_parentruntimeitem
          JOIN "Common_Routing_Slip" new_slip ON new_slip.id = NEW.egcs_cn_routingslip
          JOIN "Common_Routing_Slip" old_slip
            ON old_slip.egcs_cn_runtimeitem = old_routing.id
           AND old_slip.egcs_cn_approvaltemplate = new_slip.egcs_cn_approvaltemplate
          JOIN "Common_Approval" old_approval ON old_approval.egcs_cn_routingslip = old_slip.id
          JOIN "Common_Runtime_Item" old_step ON old_step.id = old_approval.egcs_cn_runtimeitem
          WHERE new_step.id = NEW.egcs_cn_runtimeitem
            AND (old_parent.egcs_cn_kind, old_parent.egcs_cn_order,
                 old_parent.egcs_cn_publicationversion)
              IS NOT DISTINCT FROM
                (new_parent.egcs_cn_kind, new_parent.egcs_cn_order,
                 new_parent.egcs_cn_publicationversion)
            AND old_step.egcs_cn_order = new_step.egcs_cn_order
            AND old_step.egcs_cn_publicationversion = new_step.egcs_cn_publicationversion
            AND old_approval.egcs_cn_isadded = true
            AND (old_approval.egcs_cn_sequence, old_approval.egcs_cn_name_en,
                 old_approval.egcs_cn_name_fr, old_approval.egcs_cn_defaultuser)
              IS NOT DISTINCT FROM
                (NEW.egcs_cn_sequence, NEW.egcs_cn_name_en,
                 NEW.egcs_cn_name_fr, NEW.egcs_cn_defaultuser)
        ) INTO is_exact_retry_clone;
        IF is_exact_retry_clone THEN RETURN NEW; END IF;
      END IF;
      IF routing_state <> 'awaiting_action' OR allows_additional IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Added approval steps require an awaiting routing slip that permits additions'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_addedapprovalruntime';
      END IF;
      SELECT MAX(egcs_cn_sequence) INTO max_actioned FROM "Common_Approval"
      WHERE egcs_cn_routingslip = NEW.egcs_cn_routingslip AND egcs_cn_approvalvalue IS NOT NULL;
      IF max_actioned IS NOT NULL AND NEW.egcs_cn_sequence <= max_actioned THEN
        RAISE EXCEPTION 'Added approval step must follow the last actioned step'
          USING ERRCODE = '23514', CONSTRAINT = 'cn_chk_addedapprovalsequence';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db)
  await sql`
    CREATE TRIGGER trg_validate_added_approval_runtime_step
    BEFORE INSERT ON "Common_Approval"
    FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_added_approval_runtime_step()
  `.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  // This removes the polymorphic schema objects created by `up`.
  await sql`DROP INDEX IF EXISTS cn_idx_routingslip_target_evidence`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_completion ON "Common_Completion"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_workflow_transition_mode ON "Common_Runtime"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_completion_resolution_from_workflow ON "Common_Workflow_Run"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_completion_resolution_from_completion ON "Common_Completion"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_completion_target ON "Common_Workflow_Run"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_completion_insert ON "Common_Completion"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_transition_status_agency ON "Common_Workflow_Status_Transition"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_member_status_agency ON "Common_Workflow_Setup_Member"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_allowed_status_agency ON "Common_Workflow_Setup_Allowed_Start_Status"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_setup_status_agency ON "Common_Workflow_Setup"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_setup_entity_type ON "Common_Workflow_Setup"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_preserve_workflow_runtime_definition ON "Common_Workflow_Setup"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_runtime_definition ON "Common_Runtime"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_recommendation_runtime_member ON "Common_Recommendation"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_review_set_setup_entity_type ON "Common_Review_Set_Setup"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_review_schema_entity_type ON "Common_Review_Schema"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_entity_assignment_type ON "Common_Entity_Assignment"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_workflow_status_transition ON "Common_Workflow_Status_Transition"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_member_owner ON "Common_Workflow_Setup_Member_Owner"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_validate_workflow_setup_member ON "Common_Workflow_Setup_Member"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_recommendation_setup_identity ON "Common_Recommendation_Setup"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_require_actual_delegation_detail ON "Common_Approval"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_autopopulate_self_approval ON "Common_Approval"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_assigned_user_actions ON "Common_Approval"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_require_certifications ON "Common_Approval"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_enforce_approval_sequence ON "Common_Approval"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_actioned_approval ON "Common_Approval"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_completion()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_workflow_transition_mode()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_completion_resolution()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_completion_target()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_completion_insert()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_transition_status_agency()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_status_agency()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_setup_entity_type()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_runtime_definition()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_recommendation_runtime_member`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_direct_review_entity_type()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_entity_assignment_type()`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_workflow_status_transition`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_member_owner`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_setup_member`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_recommendation_setup_identity`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_actual_delegation_detail`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_autopopulate_self_approval`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_assigned_user_actions`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_certifications`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_approval_sequence`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_actioned_approval`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_added_approval_runtime_step CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_approval_certification_evidence CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_approval_runtime_evidence CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_approval_runtime_state CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_approval_runtime_item CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_routing_slip_runtime CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Assessment_Custom_Outcome" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Assessment_Outcome" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Approval_Certification" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Approval" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Certification" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Routing_Slip" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Approval_Step" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Completion" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Additional_Reviewers" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Owner_Blocker" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Status_Transition" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Item" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Run" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Runtime_Transition" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Runtime_Item" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Runtime" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_preserve_retryable_workflow_status CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Setup_Member_Owner" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Setup_Member" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Setup_Allowed_Start_Status" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Setup" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation_Set" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation_Setup" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation_Set_Setup" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation_Schema_Version" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_recommendation_schema_version CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Recommendation_Schema" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Checklist_Response" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Assessment_Response" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Response" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_review_subtype CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Checklist" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Assessment" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Set" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Setup" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Set_Setup" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Entity_Assignment" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Extension_Entity_Owner" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS lock_extension_entity_owner_binding() CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS lock_extension_entity_owner_column() CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS bind_extension_entity_owner() CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_prevent_entity_assignment_identity_update`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_review_schema_version ON "Common_Review_Schema_Version"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_review_schema_version`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Schema_Version" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Checklist_Schema" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Assessment_Schema" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Review_Schema" CASCADE`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_approvaltemplate_publication ON "Common_Approval_Template"`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Template" DROP CONSTRAINT IF EXISTS cn_ref_approvaltemplatepublication`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Template" DROP CONSTRAINT IF EXISTS cn_chk_approvaltemplatepublicationkind`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Template" DROP COLUMN IF EXISTS egcs_cn_publicationkind`.execute(db)
  await sql`ALTER TABLE "Common_Approval_Template" ALTER COLUMN id SET DEFAULT nextval('"Common_Approval_Template_id_seq"'::regclass)`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Workflow_Publication_Status" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication_Selection" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication_Selection_Lock" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication_Version_Reference" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication_Transition" CASCADE`.execute(db)
  await sql`ALTER TABLE "Common_Publication" DROP CONSTRAINT IF EXISTS cn_ref_publicationcurrentversion`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication_Version" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Publication" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_apply_runtime_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_runtime_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_runtime_root_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_workflow_runtime_extension CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_domain_runtime_extension CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_terminal_runtime_evidence CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_guard_publication_authoring CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_runtime_state_update CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_runtime_item_hierarchy CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_runtime_item_insert CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_runtime_insert CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_runtime_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_apply_publication_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_publication_transition CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_publication_update CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_publication_version_insert CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_publication_version_reference CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_require_unsealed_publication_version CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_validate_publication_insert CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_register_publication CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_publication_evidence CASCADE`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_soft_delete_transferpaymentstream_assignments ON "Transfer_Payment_Stream"`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_register_transferpaymentstream ON "Transfer_Payment_Stream"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS register_entity`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Entity" CASCADE`.execute(db)
  await sql`DROP TRIGGER IF EXISTS trg_lock_entity_type ON "Common_Entity_Type"`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_lock_entity_type()`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Entity_Type" CASCADE`.execute(db)
  await sql`ALTER TABLE "Agency_Profile" DROP CONSTRAINT IF EXISTS ay_ref_profilegwcoanumber`.execute(db)
  await sql`ALTER TABLE "Agency_Profile" DROP COLUMN IF EXISTS "egcs_ay_gwcoa_number"`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_GWCOA" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_User" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Transfer_Payment_Stream_Document_Template" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Entity_Attachment" CASCADE`.execute(db)
  await sql`DROP FUNCTION IF EXISTS trg_fn_enforce_entity_attachment_identity_immutable() CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Attachment" CASCADE`.execute(db)
  await sql`DROP TABLE IF EXISTS "Common_Attachment_Types" CASCADE`.execute(db)
}
