import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'
import { installAuditOwnershipFunctions } from '../audit-ownership-functions'
import { AUDIT_TABLE_OWNERSHIP } from '../audit-ownership-registry'

const memoTable = 'Funding_Case_Account_Receivable_Offset_Memo'
const applicationTable = 'Funding_Case_Account_Receivable_Offset_Memo_Application'

export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Offset_Memo" (
    id bigserial PRIMARY KEY,
    egcs_fc_receivable bigint NOT NULL UNIQUE REFERENCES "Funding_Case_Agreement_Account_Receivable"(id) ON DELETE RESTRICT,
    egcs_fc_pool bigint NOT NULL REFERENCES "Funding_Case_Account_Receivable_Pool"(id) ON DELETE RESTRICT,
    egcs_fc_amount numeric(19,2) NOT NULL CHECK (egcs_fc_amount > 0),
    egcs_fc_createdat timestamptz NOT NULL DEFAULT now(),
    _deleted boolean NOT NULL DEFAULT false CHECK (_deleted = false)
  )`.execute(db)
  await sql`CREATE TABLE "Funding_Case_Account_Receivable_Offset_Memo_Application" (
    id bigserial PRIMARY KEY,
    egcs_fc_offsetmemo bigint NOT NULL REFERENCES "Funding_Case_Account_Receivable_Offset_Memo"(id) ON DELETE RESTRICT,
    egcs_fc_allocation bigint NOT NULL UNIQUE REFERENCES "Funding_Case_Account_Receivable_Allocation"(id) ON DELETE RESTRICT,
    _deleted boolean NOT NULL DEFAULT false CHECK (_deleted = false)
  )`.execute(db)
  // Backfill only additive identities/links: existing packets, recoveries, allocations and postings are never rewritten.
  await sql`INSERT INTO "Funding_Case_Account_Receivable_Offset_Memo" (egcs_fc_receivable,egcs_fc_pool,egcs_fc_amount,egcs_fc_createdat)
    SELECT debt.id,debt.egcs_fc_pool,
      greatest(ar_outstanding(debt.id) + coalesce((SELECT sum(allocation.egcs_fc_amount)
        FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
        WHERE allocation.egcs_fc_receivable=debt.id AND recovery.egcs_fc_payment IS NOT NULL
          AND recovery.egcs_fc_outcome='posted' AND NOT allocation._deleted AND NOT recovery._deleted),0),
        coalesce((SELECT max(part.amount) FROM (SELECT sum(allocation.egcs_fc_amount) AS amount
          FROM "Funding_Case_Account_Receivable_Allocation" allocation
          JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
          WHERE allocation.egcs_fc_receivable=debt.id AND recovery.egcs_fc_payment IS NOT NULL
            AND NOT allocation._deleted AND NOT recovery._deleted GROUP BY recovery.id) part),0)),
      coalesce((SELECT min(recovery.egcs_fc_createdat) FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
        WHERE allocation.egcs_fc_receivable=debt.id AND recovery.egcs_fc_payment IS NOT NULL AND NOT allocation._deleted),debt.egcs_fc_postedat)
    FROM "Funding_Case_Agreement_Account_Receivable" debt
    WHERE debt.egcs_fc_linkedreceivable IS NULL AND debt.egcs_fc_outcome='posted' AND NOT debt._deleted
      AND (EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
        WHERE allocation.egcs_fc_receivable=debt.id AND recovery.egcs_fc_payment IS NOT NULL AND NOT allocation._deleted)
        OR (ar_outstanding(debt.id)>0 AND coalesce((SELECT latest.egcs_fc_recoverymethod
          FROM "Funding_Case_Agreement_Account_Receivable" latest
          WHERE (latest.id=debt.id OR latest.egcs_fc_linkedreceivable=debt.id) AND latest.egcs_fc_outcome='posted' AND NOT latest._deleted
          ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),debt.egcs_fc_recoverymethod)='offset'))`.execute(db)
  await sql`INSERT INTO "Funding_Case_Account_Receivable_Offset_Memo_Application" (egcs_fc_offsetmemo,egcs_fc_allocation)
    SELECT memo.id,allocation.id FROM "Funding_Case_Account_Receivable_Allocation" allocation
    JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
    JOIN "Funding_Case_Account_Receivable_Offset_Memo" memo ON memo.egcs_fc_receivable=allocation.egcs_fc_receivable
    WHERE recovery.egcs_fc_payment IS NOT NULL AND NOT allocation._deleted AND NOT recovery._deleted`.execute(db)

  await sql`CREATE FUNCTION trg_fn_validate_ar_offset_memo() RETURNS trigger AS $$
    DECLARE debt record; memo record; allocation record; recovery record;
    BEGIN
      IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Offset memo identities and applications retain immutable evidence' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME='Funding_Case_Account_Receivable_Offset_Memo' THEN
        SELECT * INTO debt FROM "Funding_Case_Agreement_Account_Receivable" WHERE id=NEW.egcs_fc_receivable;
        IF debt.id IS NULL OR debt.egcs_fc_outcome<>'posted' OR debt.egcs_fc_linkedreceivable IS NOT NULL
          OR debt._deleted OR debt.egcs_fc_pool<>NEW.egcs_fc_pool THEN
          RAISE EXCEPTION 'Offset memo must belong to original established debt in its pool' USING ERRCODE='23514';
        END IF;
        IF NEW.egcs_fc_amount<>ar_outstanding(debt.id) OR NEW.egcs_fc_amount<=0
          OR coalesce((SELECT latest.egcs_fc_recoverymethod FROM "Funding_Case_Agreement_Account_Receivable" latest
            WHERE (latest.id=debt.id OR latest.egcs_fc_linkedreceivable=debt.id) AND latest.egcs_fc_outcome='posted' AND NOT latest._deleted
            ORDER BY latest.egcs_fc_postedat DESC,latest.id DESC LIMIT 1),debt.egcs_fc_recoverymethod)<>'offset' THEN
          RAISE EXCEPTION 'Offset memo requires current approved outstanding offset principal' USING ERRCODE='23514';
        END IF;
      ELSE
        SELECT * INTO memo FROM "Funding_Case_Account_Receivable_Offset_Memo" WHERE id=NEW.egcs_fc_offsetmemo FOR UPDATE;
        SELECT * INTO allocation FROM "Funding_Case_Account_Receivable_Allocation" WHERE id=NEW.egcs_fc_allocation;
        SELECT * INTO recovery FROM "Funding_Case_Account_Receivable_Recovery" WHERE id=allocation.egcs_fc_recovery;
        IF memo.id IS NULL OR allocation.id IS NULL OR allocation._deleted OR recovery.egcs_fc_payment IS NULL
          OR recovery.egcs_fc_outcome<>'open' OR recovery._deleted OR memo.egcs_fc_receivable<>allocation.egcs_fc_receivable
          OR memo.egcs_fc_pool<>recovery.egcs_fc_pool THEN
          RAISE EXCEPTION 'Offset application must link its original debt and active Payment allocation' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of [memoTable,applicationTable]) await sql`CREATE TRIGGER trg_validate_ar_offset_memo
    BEFORE INSERT OR UPDATE OR DELETE ON ${sql.table(table)} FOR EACH ROW EXECUTE FUNCTION trg_fn_validate_ar_offset_memo()`.execute(db)

  await sql`CREATE FUNCTION trg_fn_require_ar_offset_memo_application() RETURNS trigger AS $$
    DECLARE recovery_id bigint;
    BEGIN
      recovery_id := CASE WHEN TG_TABLE_NAME='Funding_Case_Account_Receivable_Recovery' THEN NEW.id ELSE (to_jsonb(NEW)->>'egcs_fc_recovery')::bigint END;
      IF EXISTS (SELECT 1 FROM "Funding_Case_Account_Receivable_Allocation" allocation
        JOIN "Funding_Case_Account_Receivable_Recovery" recovery ON recovery.id=allocation.egcs_fc_recovery
        LEFT JOIN "Funding_Case_Account_Receivable_Offset_Memo_Application" application ON application.egcs_fc_allocation=allocation.id
        LEFT JOIN "Funding_Case_Account_Receivable_Offset_Memo" memo ON memo.id=application.egcs_fc_offsetmemo
        WHERE recovery.id=recovery_id AND recovery.egcs_fc_payment IS NOT NULL AND NOT recovery._deleted AND NOT allocation._deleted
          AND (application.id IS NULL OR memo.egcs_fc_receivable<>allocation.egcs_fc_receivable OR memo.egcs_fc_pool<>recovery.egcs_fc_pool)) THEN
        RAISE EXCEPTION 'Every Payment offset allocation must apply its stable credit memo' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`.execute(db)
  for (const table of ['Funding_Case_Account_Receivable_Recovery','Funding_Case_Account_Receivable_Allocation']) {
    await sql`CREATE CONSTRAINT TRIGGER trg_require_ar_offset_memo_application AFTER INSERT OR UPDATE ON ${sql.table(table)}
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION trg_fn_require_ar_offset_memo_application()`.execute(db)
  }
  await installAuditOwnershipFunctions(db)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}

export const down = async (db: Kysely<Database>): Promise<void> => {
  if ((await db.selectFrom(memoTable).select('id').executeTakeFirst()) !== undefined) {
    throw new Error('Offset credit memos retain financial application evidence; rollback requires an explicit data-preserving export or demo reset.')
  }
  for (const table of ['Funding_Case_Account_Receivable_Recovery','Funding_Case_Account_Receivable_Allocation']) {
    await sql`DROP TRIGGER trg_require_ar_offset_memo_application ON ${sql.table(table)}`.execute(db)
  }
  await sql`DROP FUNCTION trg_fn_require_ar_offset_memo_application()`.execute(db)
  for (const table of [applicationTable,memoTable]) await sql`DROP TABLE ${sql.table(table)}`.execute(db)
  await sql`DROP FUNCTION trg_fn_validate_ar_offset_memo()`.execute(db)
  const priorRegistry = Object.fromEntries(Object.entries(AUDIT_TABLE_OWNERSHIP).filter(([table]) => ![memoTable,applicationTable].some(name => table===`public.${name}`)))
  await installAuditOwnershipFunctions(db,priorRegistry)
  await sql`SELECT audit.reconcile_capture()`.execute(db)
}
