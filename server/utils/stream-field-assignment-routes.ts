import type { H3Event } from 'h3'
import type { Transaction } from 'kysely'
import { authorizeTransferPaymentStreamResource } from './transfer-payment-route-authorization'
import { executeFreshAuthorizedTransferPaymentStreamRead, executeFreshAuthorizedTransferPaymentStreamWrite } from './transfer-payment-write-transaction'
import { badRequest, notFound, throwApiError } from './api-errors'
import { readValidatedBodyI18n, parseI18n } from './api-validate'
import { getDatabaseConstraintName } from './database-constraint-errors'
import { readAssignedAgencyCustomFieldDefinitions, readAgreementCustomFieldSections } from './agreement-custom-fields'
import { StreamFieldAssignmentCreateSchema, StreamFieldAssignmentPatchSchema } from '~~/shared/types/schemas/agreement-custom-fields'
import { isPositivePostgresBigintText } from '~~/shared/utils/database-id'
import type { Database } from '~~/shared/types/database'

type AssignmentOperation = 'read' | 'create' | 'update' | 'delete'

/**
 * Checks that an optional section belongs to the locked Stream.
 * @param event - Current request.
 * @param trx - Authorized transaction.
 * @param streamId - Owning Stream.
 * @param sectionId - Requested section.
 */
const assertSection = async (event: H3Event, trx: Transaction<Database>, streamId: string, sectionId: string | null) => {
  if (sectionId === null) return
  const section = await trx.selectFrom('Transfer_Payment_Stream_Field_Section').select('id')
    .where('id', '=', sectionId).where('egcs_tp_transferpaymentstream', '=', streamId)
    .where('_deleted', '=', false).executeTakeFirst()
  if (!section) await badRequest(event, 'INVALID_SECTION', 'apiErrors.request.invalid_resource')
}

/**
 * Reads or mutates only a Stream's association to an Agency field.
 * @param event - Current request.
 * @param operation - Requested action.
 * @returns Assignment rows or a changed row.
 */
export const streamFieldAssignmentRoute = async (event: H3Event, operation: AssignmentOperation) => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id') ?? ''
  const streamId = getRouterParam(event, 'streamId') ?? ''
  const assignmentId = getRouterParam(event, 'assignmentId') ?? ''
  if (!isPositivePostgresBigintText(profileId) || !isPositivePostgresBigintText(streamId)) {
    return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  }
  if ((operation === 'update' || operation === 'delete') && !isPositivePostgresBigintText(assignmentId)) {
    return await notFound(event, 'FIELD_ASSIGNMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
  }
  const authorizationAction = operation === 'read' ? 'read' : 'update'
  const context = await authorizeTransferPaymentStreamResource(event, authorizationAction, profileId, streamId)
  if (!context) return await notFound(event, 'STREAM_NOT_FOUND', 'apiErrors.transfer_payment.stream_not_found')
  if (operation === 'read') {
    return await executeFreshAuthorizedTransferPaymentStreamRead(event, db, profileId, context.agencyId, streamId, async trx => {
      const [items, sections] = await Promise.all([
        readAssignedAgencyCustomFieldDefinitions(trx, streamId), readAgreementCustomFieldSections(trx, streamId)
      ])
      return { items, sections }
    })
  }
  const body = operation === 'create'
    ? await readValidatedBodyI18n(event, StreamFieldAssignmentCreateSchema)
    : operation === 'update' ? await readValidatedBodyI18n(event, StreamFieldAssignmentPatchSchema) : null
  if (operation === 'update' && body && !Object.keys(body).length) {
    return await badRequest(event, 'NO_UPDATABLE_FIELDS', 'apiErrors.request.no_updatable_fields')
  }
  return await executeFreshAuthorizedTransferPaymentStreamWrite(event, db, profileId, context.agencyId, streamId, 'update', async (trx, fresh) => {
    if (operation === 'create') {
      const create = StreamFieldAssignmentCreateSchema.parse(body)
      const field = await trx.selectFrom('Agency_Custom_Field').select('id')
        .where('id', '=', create.egcs_tp_agencyfield).where('egcs_ay_agency', '=', fresh.agencyId)
        .where('_deleted', '=', false).forShare().executeTakeFirst()
      if (!field) return await badRequest(event, 'INVALID_AGENCY_FIELD', 'apiErrors.request.invalid_resource')
      await assertSection(event, trx, streamId, create.egcs_tp_section)
      try {
        return await trx.insertInto('Transfer_Payment_Stream_Field_Assignment')
          .values({ ...create, egcs_tp_transferpaymentstream: streamId })
          .returningAll().executeTakeFirstOrThrow()
      } catch (error) {
        if (getDatabaseConstraintName(error) === 'tp_idx_unique_live_field_assignment') {
          return await throwApiError(event, { statusCode: 409, code: 'FIELD_ALREADY_ASSIGNED', key: 'apiErrors.request.resource_in_use' })
        }
        throw error
      }
    }
    const current = await trx.selectFrom('Transfer_Payment_Stream_Field_Assignment').selectAll()
      .where('id', '=', assignmentId).where('egcs_tp_transferpaymentstream', '=', streamId)
      .where('_deleted', '=', false).forUpdate().executeTakeFirst()
    if (!current) return await notFound(event, 'FIELD_ASSIGNMENT_NOT_FOUND', 'apiErrors.admin_common.not_found')
    if (operation === 'delete') {
      return await trx.updateTable('Transfer_Payment_Stream_Field_Assignment').set({ _deleted: true })
        .where('id', '=', assignmentId).returningAll().executeTakeFirstOrThrow()
    }
    const patch = StreamFieldAssignmentPatchSchema.parse(body)
    const merged = await parseI18n(event, StreamFieldAssignmentCreateSchema, {
      egcs_tp_agencyfield: current.egcs_tp_agencyfield,
      egcs_tp_section: current.egcs_tp_section,
      egcs_tp_required: current.egcs_tp_required,
      egcs_tp_active: current.egcs_tp_active,
      egcs_tp_displayorder: current.egcs_tp_displayorder,
      ...patch
    })
    await assertSection(event, trx, streamId, merged.egcs_tp_section)
    return await trx.updateTable('Transfer_Payment_Stream_Field_Assignment').set({
      egcs_tp_section: merged.egcs_tp_section, egcs_tp_required: merged.egcs_tp_required,
      egcs_tp_active: merged.egcs_tp_active, egcs_tp_displayorder: merged.egcs_tp_displayorder
    }).where('id', '=', assignmentId).returningAll().executeTakeFirstOrThrow()
  })
}
