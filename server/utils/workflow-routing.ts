/* eslint-disable jsdoc/require-jsdoc -- Coordinates capture, pure evaluation and locked route validation before runtime creation. */
import { createHash } from 'node:crypto'
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import type { ReviewRuntimeEntityContext } from './review-runtime-access'
import { validatePublishedWorkflowStatusGraph, type PublishedWorkflowConfiguration } from './workflow-setup-versioning'
import { captureWorkflowRoutingSnapshot } from './workflow-routing-capture'
import { evaluateWorkflowConditions } from './workflow-condition-evaluation'
import { assertWorkflowRouteRequirements, selectWorkflowRoute } from './workflow-execution-plan'
import { WorkflowRouteValidationError, type WorkflowRoutingEvidence } from './workflow-routing-contract'

export const captureWorkflowRouting = async (
  trx: Transaction<Database>, context: ReviewRuntimeEntityContext, definition: PublishedWorkflowConfiguration
): Promise<WorkflowRoutingEvidence> => {
  const snapshot = await captureWorkflowRoutingSnapshot(trx, context, definition)
  const decisions = evaluateWorkflowConditions(definition, snapshot)
  const route = selectWorkflowRoute(definition, decisions)
  assertWorkflowRouteRequirements(route)
  const statusIds = [...new Set([
    ...route.allowedStartStatuses, route.cancellationStatus, route.executionFailureStatus,
    ...route.members.flatMap(member => [member.materializationStatus, member.successStatus, member.failureStatus].filter((id): id is string => Boolean(id)))
  ])].sort()
  const statuses = await trx.selectFrom('Common_Status').select(['id', 'egcs_cn_terminal'])
    .where('id', 'in', statusIds).where('_deleted', '=', false).orderBy('id').forUpdate().execute()
  try {
    validatePublishedWorkflowStatusGraph(route, new Map(statuses.map(status => [String(status.id), { id: String(status.id), terminal: status.egcs_cn_terminal }])))
  } catch (error) {
    throw new WorkflowRouteValidationError(error instanceof Error ? error.message : 'Invalid workflow route', { cause: error })
  }
  // Preserve the version-2 serialization order and hash contract of retained evidence.
  const evidence = { version: 2 as const, agreementId: snapshot.agreementId, values: snapshot.values, decisions, fields: snapshot.fields,
    ...(snapshot.profile ? { profile: snapshot.profile, relationships: snapshot.relationships } : {}) }
  return { ...evidence, hash: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') }
}
