import type { H3Event } from 'h3'
import type { Selectable, Transaction } from 'kysely'
import { sql } from 'kysely'
/* eslint-disable jsdoc/require-param, jsdoc/require-returns -- Focused tests document this internal administration contract. */
import type { CommonStatusTable, Database } from '~~/shared/types/database'
import { authorize } from '~~/server/utils/authorize'
import { notFound, throwApiError } from '~~/server/utils/api-errors'
import { throwIfMappedConstraintError } from '~~/server/utils/database-constraint-errors'

const BUSINESS_STATUS_TABLES = [
  'Funding_Case_Agreement_Profile',
  'Funding_Case_Agreement_Amendment',
  'Funding_Case_Agreement_Closeout',
  'Funding_Case_Agreement_Claim',
  'Funding_Case_Agreement_Claim_Reconcile',
  'Funding_Case_Agreement_Commitment',
  'Funding_Case_Agreement_Payment',
  'Funding_Case_Agreement_Forecast',
  'Funding_Case_Agreement_Monitor'
] as const

type StatusAdministrationAction = 'update' | 'delete'

const STATUS_CONSTRAINT_ERRORS = {
  cn_idx_status_name_en_per_agency: { code: 'STATUS_NAME_EN_CONFLICT', key: 'apiErrors.status.name_conflict' },
  cn_idx_status_name_fr_per_agency: { code: 'STATUS_NAME_FR_CONFLICT', key: 'apiErrors.status.name_conflict' },
  cn_chk_status_claim_reconciliation_in_use: { code: 'STATUS_REFERENCED', key: 'apiErrors.status.referenced' }
} as const

/** Maps concurrent bilingual-name conflicts to the stable localized status API contract. */
export const throwIfStatusConstraintError = async (event: H3Event, error: unknown): Promise<never> =>
  await throwIfMappedConstraintError(event, error, ['23505', '23514'], STATUS_CONSTRAINT_ERRORS)

/** Resolves a status through its Agency authorization boundary. */
export const authorizeStatusDefinition = async (
  event: H3Event,
  statusId: string,
  action: StatusAdministrationAction
): Promise<Selectable<CommonStatusTable>> => {
  const authorization = await authorize(event, 'agency', action, async ({ context }) => {
    const status = await event.context.$db.selectFrom('Common_Status')
      .selectAll()
      .where('id', '=', statusId)
      .executeTakeFirst()
    if (!status) return await notFound(event, 'STATUS_NOT_FOUND', 'apiErrors.status.not_found')

    const scope = { type: 'agency' as const, agencyId: status.egcs_cn_agency }
    if (!context.userAbilities.authorize('agency', action, scope)) {
      return await notFound(event, 'STATUS_NOT_FOUND', 'apiErrors.status.not_found')
    }
    return { scope, data: status }
  })

  return authorization.data!
}

/** Finds a live business or workflow configuration reference that blocks soft deletion. */
export const findLiveStatusReference = async (
  trx: Transaction<Database>,
  statusId: string
): Promise<string | null> => {
  for (const table of BUSINESS_STATUS_TABLES) {
    const record = await trx.selectFrom(table)
      .select('id')
      .where('egcs_fc_status', '=', statusId)
      .where('_deleted', '=', false)
      .executeTakeFirst()
    if (record) return table
  }

  const agencyConfiguration = await trx.selectFrom('Agency_Profile')
    .select('id')
    .where('_deleted', '=', false)
    .where(eb => eb.or([
      eb('egcs_ay_claimreconciliationstartstatus', '=', statusId),
      eb('egcs_ay_claimreconciliationfinalstatus', '=', statusId)
    ]))
    .executeTakeFirst()
  if (agencyConfiguration) return 'Agency_Profile'

  const workflowSetup = await trx.selectFrom('Common_Workflow_Setup')
    .select('id')
    .where('_deleted', '=', false)
    .where(eb => eb.or([
      eb('egcs_cn_cancellationstatus', '=', statusId),
      eb('egcs_cn_executionfailurestatus', '=', statusId)
    ]))
    .executeTakeFirst()
  if (workflowSetup) return 'Common_Workflow_Setup'

  const allowedStart = await trx.selectFrom('Common_Workflow_Setup_Allowed_Start_Status as allowed')
    .innerJoin('Common_Workflow_Setup as workflow', 'workflow.id', 'allowed.egcs_cn_workflowsetup')
    .select('allowed.id')
    .where('allowed.egcs_cn_status', '=', statusId)
    .where('allowed._deleted', '=', false)
    .where('workflow._deleted', '=', false)
    .executeTakeFirst()
  if (allowedStart) return 'Common_Workflow_Setup_Allowed_Start_Status'

  const member = await trx.selectFrom('Common_Workflow_Setup_Member as member')
    .innerJoin('Common_Workflow_Setup as workflow', 'workflow.id', 'member.egcs_cn_workflowsetup')
    .select('member.id')
    .where('member._deleted', '=', false)
    .where('workflow._deleted', '=', false)
    .where(eb => eb.or([
      eb('member.egcs_cn_materializationstatus', '=', statusId),
      eb('member.egcs_cn_successstatus', '=', statusId),
      eb('member.egcs_cn_failurestatus', '=', statusId)
    ]))
    .executeTakeFirst()
  if (member) return 'Common_Workflow_Setup_Member'

  const publishedWorkflow = await trx.selectFrom('Common_Workflow_Setup as workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'workflow.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select('workflow.id')
    .where('workflow._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where(sql<boolean>`(
      version.egcs_cn_definition ->> 'cancellationStatus' = ${statusId}
      OR version.egcs_cn_definition ->> 'executionFailureStatus' = ${statusId}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(version.egcs_cn_definition -> 'allowedStartStatuses', '[]'::jsonb)
        ) AS allowed_status(value)
        WHERE allowed_status.value = ${statusId}
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb)
        ) AS configured_member(value)
        WHERE configured_member.value ->> 'materializationStatus' = ${statusId}
          OR configured_member.value ->> 'successStatus' = ${statusId}
          OR configured_member.value ->> 'failureStatus' = ${statusId}
      )
    )`)
    .executeTakeFirst()
  if (publishedWorkflow) return 'Common_Workflow_Setup'

  const activeRun = await trx.selectFrom('Common_Workflow_Run as run')
    .innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select('run.id')
    .where('runtime._deleted', '=', false)
    .where('runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where(sql<boolean>`(
      version.egcs_cn_definition ->> 'cancellationStatus' = ${statusId}
      OR version.egcs_cn_definition ->> 'executionFailureStatus' = ${statusId}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(version.egcs_cn_definition -> 'allowedStartStatuses', '[]'::jsonb)
        ) AS allowed_status(value)
        WHERE allowed_status.value = ${statusId}
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb)
        ) AS configured_member(value)
        WHERE configured_member.value ->> 'materializationStatus' = ${statusId}
          OR configured_member.value ->> 'successStatus' = ${statusId}
          OR configured_member.value ->> 'failureStatus' = ${statusId}
      )
    )`)
    .executeTakeFirst()
  if (activeRun) return 'Common_Workflow_Run'

  const retryableRun = await trx.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .innerJoin('Common_Workflow_Publication_Status as pinned', 'pinned.egcs_cn_publicationversion', 'version.id')
    .select('runtime.id')
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_state', 'in', ['unsuccessful', 'denied', 'cancelled', 'failed'])
    .where('runtime._deleted', '=', false)
    .where(sql<boolean>`NOT EXISTS (
      SELECT 1
      FROM "Common_Runtime" AS newer_runtime
      WHERE newer_runtime.egcs_cn_kind = 'workflow'
        AND newer_runtime.egcs_cn_entitytype = runtime.egcs_cn_entitytype
        AND newer_runtime.egcs_cn_entityid = runtime.egcs_cn_entityid
        AND newer_runtime.egcs_cn_purpose = runtime.egcs_cn_purpose
        AND newer_runtime.id > runtime.id
        AND newer_runtime._deleted = false
    )`)
    .where('pinned.egcs_cn_status', '=', statusId)
    .where(sql<boolean>`COALESCE((version.egcs_cn_definition ->> 'allowRetry')::boolean, false)`)
    .executeTakeFirst()
  return retryableRun ? 'Common_Workflow_Run' : null
}

/** Rejects soft deletion while a live record or editable configuration still uses the status. */
export const assertStatusCanBeDeleted = async (
  event: H3Event,
  trx: Transaction<Database>,
  statusId: string
): Promise<void> => {
  if (!await findLiveStatusReference(trx, statusId)) return
  return await throwApiError(event, {
    statusCode: 409,
    code: 'STATUS_REFERENCED',
    key: 'apiErrors.status.referenced'
  })
}

/** Rejects a new terminal flag when it would invalidate an active published workflow graph. */
export const assertTerminalStatusCompatibleWithPublishedWorkflows = async (
  event: H3Event,
  trx: Transaction<Database>,
  statusId: string
): Promise<void> => {
  const allowedStart = await trx.selectFrom('Common_Workflow_Setup_Allowed_Start_Status as allowed')
    .innerJoin('Common_Workflow_Setup as workflow', 'workflow.id', 'allowed.egcs_cn_workflowsetup')
    .innerJoin('Common_Publication as publication', 'publication.id', 'workflow.id')
    .select('allowed.id')
    .where('allowed.egcs_cn_status', '=', statusId)
    .where('allowed._deleted', '=', false)
    .where('workflow._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .executeTakeFirst()

  const intermediateMember = await trx.selectFrom('Common_Workflow_Setup_Member as member')
    .innerJoin('Common_Workflow_Setup as workflow', 'workflow.id', 'member.egcs_cn_workflowsetup')
    .innerJoin('Common_Publication as publication', 'publication.id', 'workflow.id')
    .leftJoin('Common_Workflow_Setup_Member as later', join => join
      .onRef('later.egcs_cn_workflowsetup', '=', 'member.egcs_cn_workflowsetup')
      .onRef('later.egcs_cn_sequence', '>', 'member.egcs_cn_sequence')
      .on('later._deleted', '=', false))
    .select('member.id')
    .where('member._deleted', '=', false)
    .where('workflow._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where(eb => eb.or([
      eb('member.egcs_cn_materializationstatus', '=', statusId),
      eb.and([
        eb('member.egcs_cn_successstatus', '=', statusId),
        eb('later.id', 'is not', null)
      ])
    ]))
    .executeTakeFirst()

  const publishedWorkflowConflict = await trx.selectFrom('Common_Workflow_Setup as workflow')
    .innerJoin('Common_Publication as publication', 'publication.id', 'workflow.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'publication.egcs_cn_currentversion')
    .select('workflow.id')
    .where('workflow._deleted', '=', false)
    .where('publication.egcs_cn_state', '=', 'published')
    .where(sql<boolean>`(
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(version.egcs_cn_definition -> 'allowedStartStatuses', '[]'::jsonb)
        ) AS allowed_status(value)
        WHERE allowed_status.value = ${statusId}
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb)
        ) WITH ORDINALITY AS configured_member(value, member_order)
        WHERE configured_member.value ->> 'materializationStatus' = ${statusId}
          OR (
            configured_member.value ->> 'successStatus' = ${statusId}
            AND configured_member.member_order
              < jsonb_array_length(COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb))
          )
      )
    )`)
    .executeTakeFirst()

  const activeRunConflict = await trx.selectFrom('Common_Workflow_Run as run')
    .innerJoin('Common_Runtime as runtime', 'runtime.id', 'run.id')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select('run.id')
    .where('runtime._deleted', '=', false)
    .where('runtime.egcs_cn_state', 'in', ['pending', 'active', 'awaiting_action', 'paused'])
    .where(sql<boolean>`(
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE(version.egcs_cn_definition -> 'allowedStartStatuses', '[]'::jsonb)
        ) AS allowed_status(value)
        WHERE allowed_status.value = ${statusId}
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb)
        ) WITH ORDINALITY AS configured_member(value, member_order)
        WHERE configured_member.value ->> 'materializationStatus' = ${statusId}
          OR (
            configured_member.value ->> 'successStatus' = ${statusId}
            AND configured_member.member_order
              < jsonb_array_length(COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb))
          )
      )
    )`)
    .executeTakeFirst()

  const retryableRunConflict = await trx.selectFrom('Common_Runtime as runtime')
    .innerJoin('Common_Publication_Version as version', 'version.id', 'runtime.egcs_cn_sourcepublicationversion')
    .select('runtime.id')
    .where('runtime.egcs_cn_kind', '=', 'workflow')
    .where('runtime.egcs_cn_state', 'in', ['unsuccessful', 'denied', 'cancelled', 'failed'])
    .where('runtime._deleted', '=', false)
    .where(sql<boolean>`NOT EXISTS (
      SELECT 1
      FROM "Common_Runtime" AS newer_runtime
      WHERE newer_runtime.egcs_cn_kind = 'workflow'
        AND newer_runtime.egcs_cn_entitytype = runtime.egcs_cn_entitytype
        AND newer_runtime.egcs_cn_entityid = runtime.egcs_cn_entityid
        AND newer_runtime.egcs_cn_purpose = runtime.egcs_cn_purpose
        AND newer_runtime.id > runtime.id
        AND newer_runtime._deleted = false
    )`)
    .where(sql<boolean>`COALESCE((version.egcs_cn_definition ->> 'allowRetry')::boolean, false)`)
    .where(sql<boolean>`(
      EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          COALESCE(version.egcs_cn_definition -> 'allowedStartStatuses', '[]'::jsonb)
        ) AS allowed_status(value)
        WHERE allowed_status.value = ${statusId}
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb)
        ) WITH ORDINALITY AS configured_member(value, member_order)
        WHERE configured_member.value ->> 'materializationStatus' = ${statusId}
          OR (
            configured_member.value ->> 'successStatus' = ${statusId}
            AND configured_member.member_order
              < jsonb_array_length(COALESCE(version.egcs_cn_definition -> 'members', '[]'::jsonb))
          )
      )
    )`)
    .executeTakeFirst()

  if (!allowedStart && !intermediateMember && !publishedWorkflowConflict && !activeRunConflict && !retryableRunConflict) return
  return await throwApiError(event, {
    statusCode: 409,
    code: 'STATUS_PUBLISHED_WORKFLOW_CONFLICT',
    key: 'apiErrors.status.published_workflow_conflict'
  })
}

/** Rejects restore when an active bilingual name was claimed while this status was deleted. */
export const assertStatusCanBeRestored = async (
  event: H3Event,
  trx: Transaction<Database>,
  status: Selectable<CommonStatusTable>
): Promise<void> => {
  const duplicate = await trx.selectFrom('Common_Status')
    .select('id')
    .where('egcs_cn_agency', '=', status.egcs_cn_agency)
    .where('id', '!=', status.id)
    .where('_deleted', '=', false)
    .where(eb => eb.or([
      eb(sql<string>`LOWER(BTRIM(egcs_cn_name_en))`, '=', status.egcs_cn_name_en.trim().toLowerCase()),
      eb(sql<string>`LOWER(BTRIM(egcs_cn_name_fr))`, '=', status.egcs_cn_name_fr.trim().toLowerCase())
    ]))
    .executeTakeFirst()
  if (!duplicate) return
  return await throwApiError(event, {
    statusCode: 409,
    code: 'STATUS_RESTORE_NAME_CONFLICT',
    key: 'apiErrors.status.restore_name_conflict'
  })
}
