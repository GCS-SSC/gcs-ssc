import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

/** Adds optional, monitor-scoped links to the monitor work chain. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  const links = [
    ['Funding_Case_Agreement_Monitor_Planning', 'Funding_Case_Agreement_Monitor_Items', 'egcs_fc_monitorplanning', 'fc_fk_monitor_item_planning'],
    ['Funding_Case_Agreement_Monitor_Items', 'Funding_Case_Agreement_Monitor_Finding', 'egcs_fc_monitoritem', 'fc_fk_monitor_finding_item'],
    ['Funding_Case_Agreement_Monitor_Finding', 'Funding_Case_Agreement_Monitor_Followup', 'egcs_fc_monitorfinding', 'fc_fk_monitor_followup_finding']
  ] as const

  for (const [parent, child, column, constraint] of links) {
    await sql`ALTER TABLE ${sql.table(parent)} ADD CONSTRAINT ${sql.id(`fc_uq_${parent.toLowerCase()}_monitor`)} UNIQUE (id, egcs_fc_fundingagreementmonitor)`.execute(db)
    await sql`ALTER TABLE ${sql.table(child)} ADD COLUMN ${sql.id(column)} bigint`.execute(db)
    await sql`ALTER TABLE ${sql.table(child)} ADD CONSTRAINT ${sql.id(constraint)}
      FOREIGN KEY (${sql.id(column)}, egcs_fc_fundingagreementmonitor)
      REFERENCES ${sql.table(parent)} (id, egcs_fc_fundingagreementmonitor) ON DELETE RESTRICT`.execute(db)
    await sql`CREATE INDEX ${sql.id(`fc_idx_${column}`)} ON ${sql.table(child)} (${sql.id(column)})
      WHERE ${sql.id(column)} IS NOT NULL AND _deleted = false`.execute(db)
  }
}

/** A rollback is safe only when no authored links would be lost. */
export const down = async (db: Kysely<Database>): Promise<void> => {
  const links = [
    ['Funding_Case_Agreement_Monitor_Planning', 'Funding_Case_Agreement_Monitor_Items', 'egcs_fc_monitorplanning', 'fc_fk_monitor_item_planning'],
    ['Funding_Case_Agreement_Monitor_Items', 'Funding_Case_Agreement_Monitor_Finding', 'egcs_fc_monitoritem', 'fc_fk_monitor_finding_item'],
    ['Funding_Case_Agreement_Monitor_Finding', 'Funding_Case_Agreement_Monitor_Followup', 'egcs_fc_monitorfinding', 'fc_fk_monitor_followup_finding']
  ] as const
  for (const [, child, column] of links) {
    const populated = await sql`SELECT 1 FROM ${sql.table(child)} WHERE ${sql.id(column)} IS NOT NULL LIMIT 1`.execute(db)
    if (populated.rows.length) throw new Error(`Cannot remove populated monitor link ${column}`)
  }
  for (const [parent, child, column, constraint] of [...links].reverse()) {
    await sql`ALTER TABLE ${sql.table(child)} DROP CONSTRAINT ${sql.id(constraint)}`.execute(db)
    await sql`ALTER TABLE ${sql.table(child)} DROP COLUMN ${sql.id(column)}`.execute(db)
    await sql`ALTER TABLE ${sql.table(parent)} DROP CONSTRAINT ${sql.id(`fc_uq_${parent.toLowerCase()}_monitor`)}`.execute(db)
  }
}
