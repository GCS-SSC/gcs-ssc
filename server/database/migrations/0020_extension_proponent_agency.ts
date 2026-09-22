import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Pins the agency of a qualified Proponent extension identity at creation time. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`ALTER TABLE "Common_Extension_Entity_Owner"
    ADD COLUMN egcs_cn_agency bigint REFERENCES "Agency_Profile"(id) ON DELETE RESTRICT`.execute(db)
  // The previously selected tracking agency is a one-time attribution for retained bindings.
  await sql`UPDATE "Common_Extension_Entity_Owner" binding
    SET egcs_cn_agency = profile.egcs_ar_leadagency
    FROM "Applicant_Recipient_Profile" profile
    WHERE binding.egcs_cn_ownertype = 'applicantrecipient'
      AND profile.id = binding.egcs_cn_ownerid`.execute(db)
  await sql`
    CREATE OR REPLACE FUNCTION bind_extension_entity_owner() RETURNS trigger AS $$
    DECLARE target_id bigint; owner_id bigint; agency_id bigint;
    BEGIN
      target_id := (to_jsonb(NEW) ->> TG_ARGV[1])::bigint;
      owner_id := (to_jsonb(NEW) ->> TG_ARGV[3])::bigint;
      IF target_id IS NULL OR owner_id IS NULL THEN
        RAISE EXCEPTION 'Extension lifecycle entity owner binding requires non-null target and owner identities'
          USING ERRCODE = '23502';
      END IF;
      IF TG_ARGV[2] = 'applicantrecipient' THEN
        IF TG_NARGS < 5 THEN
          RAISE EXCEPTION 'Proponent extension lifecycle identity requires an explicit agency column'
            USING ERRCODE = '23502';
        END IF;
        agency_id := (to_jsonb(NEW) ->> TG_ARGV[4])::bigint;
        IF agency_id IS NULL THEN
          RAISE EXCEPTION 'Proponent extension lifecycle identity requires an explicit agency'
            USING ERRCODE = '23502';
        END IF;
      END IF;
      INSERT INTO "Common_Extension_Entity_Owner" (
        egcs_cn_entityid, egcs_cn_entitytype, egcs_cn_ownerid, egcs_cn_ownertype, egcs_cn_agency
      ) VALUES (target_id, TG_ARGV[0], owner_id, TG_ARGV[2], agency_id);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
}

/** Restores the old binding trigger and removes pinned agency context. */
export const down = async (db: Kysely<Database>): Promise<void> => {
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
        egcs_cn_entityid, egcs_cn_entitytype, egcs_cn_ownerid, egcs_cn_ownertype
      ) VALUES (target_id, TG_ARGV[0], owner_id, TG_ARGV[2]);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db)
  await sql`ALTER TABLE "Common_Extension_Entity_Owner" DROP COLUMN egcs_cn_agency`.execute(db)
}
