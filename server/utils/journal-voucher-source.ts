import { sql } from 'kysely'

/**
 * SQL predicate for a finalized source Payment, applied before lookup pagination
 * and again inside the protected creation/routing transaction. Legacy terminal
 * Payments without Completion remain eligible. Retained negative approval and
 * unfinished Completion evidence cannot become an accounting baseline.
 * @param paymentAlias - Trusted query alias for the Payment table.
 * @returns A predicate using the ordinary status and shared lifecycle evidence.
 */
export const journalVoucherPaymentIsFinal = (paymentAlias: string) => {
  const paymentId = sql.ref(`${paymentAlias}.id`)
  return sql<boolean>`
    EXISTS (
      SELECT 1 FROM "Common_Status" AS source_status
      WHERE source_status.id = ${sql.ref(`${paymentAlias}.egcs_fc_status`)}
        AND source_status.egcs_cn_terminal = TRUE AND source_status._deleted = FALSE
    )
    AND ${sql.ref(`${paymentAlias}._deleted`)} = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM "Common_Completion" AS source_completion
      WHERE source_completion.egcs_cn_entitytype = 'fundingcasepayment'
        AND source_completion.egcs_cn_entityid = ${paymentId} AND source_completion._deleted = FALSE
        AND source_completion.egcs_cn_disposition <> 'no_workflow'
        AND COALESCE((
          SELECT source_runtime.egcs_cn_state IN ('succeeded', 'approved')
          FROM "Common_Workflow_Run" AS source_run
          INNER JOIN "Common_Runtime" AS source_runtime ON source_runtime.id = source_run.id
          WHERE source_run.egcs_cn_completion = source_completion.id AND source_runtime._deleted = FALSE
          ORDER BY source_runtime.egcs_cn_attempt DESC, source_runtime.id DESC LIMIT 1
        ), FALSE) = FALSE
    )
    AND COALESCE((
      SELECT source_item.egcs_cn_state NOT IN ('denied', 'unsuccessful', 'cancelled', 'failed')
      FROM "Common_Routing_Slip" AS source_slip
      INNER JOIN "Common_Runtime_Item" AS source_item ON source_item.id = source_slip.egcs_cn_runtimeitem
      INNER JOIN "Common_Runtime" AS source_runtime ON source_runtime.id = source_item.egcs_cn_runtime
      WHERE source_slip.egcs_cn_entitytype = 'fundingcasepayment' AND source_slip.egcs_cn_entityid = ${paymentId}
        AND source_slip._deleted = FALSE AND source_item._deleted = FALSE AND source_runtime._deleted = FALSE
        AND source_item.egcs_cn_parentruntimeitem IS NULL
      ORDER BY source_runtime.id DESC, source_slip.id DESC LIMIT 1
    ), TRUE)
  `
}
