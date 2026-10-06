import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: rbac. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE SEQUENCE "role_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "role_permission_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "role_transfer_payment_scope_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE SEQUENCE "user_role_assignment_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 NO CYCLE;

CREATE TABLE "role" (
  "id" bigint DEFAULT nextval('role_id_seq'::regclass) NOT NULL,
  "agency_id" bigint,
  "name_en" character varying NOT NULL,
  "name_fr" character varying NOT NULL,
  "description_en" text,
  "description_fr" text,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "role_pkey" PRIMARY KEY (id)
);

CREATE TABLE "role_permission" (
  "id" bigint DEFAULT nextval('role_permission_id_seq'::regclass) NOT NULL,
  "role_id" bigint NOT NULL,
  "subject" character varying NOT NULL,
  "access_level" character varying,
  "can_manage_assignments" boolean DEFAULT false NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "role_permission_pkey" PRIMARY KEY (id),
  CONSTRAINT "role_permission_access_level_check" CHECK (((access_level IS NULL) OR ((access_level)::text = ANY ((ARRAY['viewer'::character varying, 'contributor'::character varying, 'manager'::character varying])::text[])))),
  CONSTRAINT "role_permission_assignment_subject_check" CHECK (((can_manage_assignments = false) OR ((subject)::text = ANY ((ARRAY['agreement'::character varying, 'applicant_recipient'::character varying, 'funding_case'::character varying, 'journal_voucher'::character varying, 'correction'::character varying, 'account_receivable'::character varying])::text[])))),
  CONSTRAINT "role_permission_effective_check" CHECK (((access_level IS NOT NULL) OR (can_manage_assignments = true))),
  CONSTRAINT "role_permission_subject_check" CHECK (((subject)::text = ANY ((ARRAY['audit'::character varying, 'system'::character varying, 'agency'::character varying, 'transfer_payment'::character varying, 'role'::character varying, 'user'::character varying, 'group'::character varying, 'agreement'::character varying, 'applicant_recipient'::character varying, 'funding_case'::character varying, 'journal_voucher'::character varying, 'correction'::character varying, 'account_receivable'::character varying])::text[])))
);

CREATE UNIQUE INDEX role_permission_unique_active ON role_permission USING btree (role_id, subject) WHERE (_deleted = false);

CREATE TABLE "role_transfer_payment_scope" (
  "id" bigint DEFAULT nextval('role_transfer_payment_scope_id_seq'::regclass) NOT NULL,
  "role_id" bigint NOT NULL,
  "transfer_payment_profile_id" bigint NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "role_transfer_payment_scope_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX role_transfer_payment_scope_unique_active ON role_transfer_payment_scope USING btree (role_id, transfer_payment_profile_id) WHERE (_deleted = false);

CREATE TABLE "user_role_assignment" (
  "id" bigint DEFAULT nextval('user_role_assignment_id_seq'::regclass) NOT NULL,
  "user_id" bigint NOT NULL,
  "role_id" bigint NOT NULL,
  "createdAt" timestamp without time zone NOT NULL,
  "_deleted" boolean DEFAULT false NOT NULL,
  CONSTRAINT "user_role_assignment_pkey" PRIMARY KEY (id)
);

CREATE INDEX user_role_assignment_audit_actor_active ON user_role_assignment USING btree (((user_id)::text)) WHERE (NOT _deleted);

CREATE UNIQUE INDEX user_role_assignment_unique_active ON user_role_assignment USING btree (user_id, role_id) WHERE (_deleted = false);

ALTER SEQUENCE "role_id_seq" OWNED BY "role"."id";

ALTER SEQUENCE "role_permission_id_seq" OWNED BY "role_permission"."id";

ALTER SEQUENCE "role_transfer_payment_scope_id_seq" OWNED BY "role_transfer_payment_scope"."id";

ALTER SEQUENCE "user_role_assignment_id_seq" OWNED BY "user_role_assignment"."id";
END $baseline$`.execute(db)
}

/** Installs the current installFunctions definitions for this subject on a fresh database. */
export const installFunctions = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE FUNCTION enforce_role_permission_scope()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE target_role_id bigint; role_agency_id bigint; has_program_scope boolean; scope_type text; invalid_count integer;
    BEGIN
      IF TG_TABLE_NAME = 'role' THEN
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
      ELSE
        target_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
      END IF;
      SELECT agency_id INTO role_agency_id FROM role WHERE id = target_role_id AND _deleted = false;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT EXISTS(SELECT 1 FROM role_transfer_payment_scope WHERE role_id = target_role_id AND _deleted = false) INTO has_program_scope;
      IF role_agency_id IS NULL AND has_program_scope THEN
        RAISE EXCEPTION 'global role cannot have transfer payment scopes'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      scope_type := CASE WHEN role_agency_id IS NULL THEN 'global' WHEN has_program_scope THEN 'program' ELSE 'agency' END;
      SELECT count(*) INTO invalid_count FROM role_permission
      WHERE role_id = target_role_id AND _deleted = false AND (
        (subject = 'system' AND scope_type <> 'global')
        OR (subject IN ('audit', 'agency', 'role', 'user', 'applicant_recipient') AND scope_type = 'program')
      );
      IF invalid_count > 0 THEN
        RAISE EXCEPTION 'role permission is incompatible with role scope'
          USING ERRCODE = '23514', CONSTRAINT = 'role_permission_scope_check';
      END IF;
      RETURN NULL;
    END;
    $function$;
END $baseline$`.execute(db)
}

/** Installs the current installForeignKeys definitions for this subject on a fresh database. */
export const installForeignKeys = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
ALTER TABLE "role" ADD CONSTRAINT "role_agency_fk" FOREIGN KEY (agency_id) REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE;

ALTER TABLE "role_transfer_payment_scope" ADD CONSTRAINT "role_transfer_payment_scope_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE;

ALTER TABLE "role_transfer_payment_scope" ADD CONSTRAINT "role_transfer_payment_scope_transfer_payment_profile_id_fkey" FOREIGN KEY (transfer_payment_profile_id) REFERENCES "Transfer_Payment_Profile"(id) ON DELETE RESTRICT;

ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_role_id_fkey" FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE;

ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
END $baseline$`.execute(db)
}

/** Installs the current installTriggers definitions for this subject on a fresh database. */
export const installTriggers = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE CONSTRAINT TRIGGER trg_role_permission_scope_role AFTER UPDATE OF agency_id, _deleted ON role DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope();

CREATE CONSTRAINT TRIGGER trg_role_permission_scope_permission AFTER INSERT OR DELETE OR UPDATE ON role_permission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope();

CREATE CONSTRAINT TRIGGER trg_role_permission_scope_program AFTER INSERT OR DELETE OR UPDATE ON role_transfer_payment_scope DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_role_permission_scope();
END $baseline$`.execute(db)
}
