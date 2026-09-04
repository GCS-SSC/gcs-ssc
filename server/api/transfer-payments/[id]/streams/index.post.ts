import { sql } from 'kysely'
import type { Scope } from '~~/shared/utils/scopes'
import { TransferPaymentStreamSchema } from '~~/shared/types/schemas'
import {
  authorizeWithFreshAuthContext,
  requireFreshAuthContext
} from '~~/server/utils/authorize'
import { lockRegisteredExtensionAgreementScopes } from '~~/server/utils/extensions'
import { authorizeTransferPaymentProfileResource } from '~~/server/utils/transfer-payment-route-authorization'
import { throwIfTransferPaymentUniqueConstraintError } from '~~/server/utils/transfer-payment-unique-constraint-errors'
import { normalizeTextKey } from '~~/server/utils/transfer-payment-uniqueness'

/** Signals that a profile's agency changed before stream-creation locks stabilized. */
class TransferPaymentStreamCreateScopeChanged extends Error {
  /**
   * Records the agency observed after the profile row was locked.
   *
   * @param agencyId - Current owning agency identifier.
   */
  constructor(readonly agencyId: string) {
    super('Transfer-payment stream creation scope changed while acquiring locks.')
  }
}

/**
 *  * Event handler for this server API route. Handles the incoming request payload, performs necessary business logic and authorization operations, and returns the expected endpoint response array or object.
 *  *
 *  * @param event - The active H3 event context encapsulating the request and response objects.
 *
 */
export default defineEventHandler(async event => {
  const db = event.context.$db
  const profileId = getRouterParam(event, 'id')
  if (!profileId) {
    return await badRequest(event, 'MISSING_ID', 'apiErrors.request.missing_id')
  }

  const profileAccess = await authorizeTransferPaymentProfileResource(event, 'create', profileId)
  if (!profileAccess) {
    return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
  }
  const validated = await readValidatedBodyI18n(event, TransferPaymentStreamSchema)

  let lockAgencyId = profileAccess.agencyId
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await db.transaction().execute(async trx => {
          const authContext = await requireFreshAuthContext(event, trx)
          await lockRegisteredExtensionAgreementScopes(trx, lockAgencyId, [])
          const profile = await trx
            .selectFrom('Transfer_Payment_Profile')
            .select('egcs_tp_agency')
            .where('id', '=', profileId)
            .where('_deleted', '=', false)
            .forUpdate('Transfer_Payment_Profile')
            .executeTakeFirst()
          if (!profile) {
            return await notFound(event, 'TRANSFER_PAYMENT_PROFILE_NOT_FOUND', 'apiErrors.transfer_payment.profile_not_found')
          }
          const currentAgencyId = String(profile.egcs_tp_agency)
          if (currentAgencyId !== lockAgencyId) {
            throw new TransferPaymentStreamCreateScopeChanged(currentAgencyId)
          }
          const parentStream = validated.egcs_tp_parentstream
            ? await trx
                .selectFrom('Transfer_Payment_Stream')
                .select(['id', 'egcs_tp_transferpaymentprofile'])
                .where('id', '=', validated.egcs_tp_parentstream)
                .where('_deleted', '=', false)
                .forUpdate('Transfer_Payment_Stream')
                .executeTakeFirst()
            : undefined
          if (
            validated.egcs_tp_parentstream
            && (!parentStream || String(parentStream.egcs_tp_transferpaymentprofile) !== profileId)
          ) {
            return await badRequest(
              event,
              'TRANSFER_PAYMENT_PARENT_STREAM_INVALID',
              'apiErrors.transfer_payment.parent_stream_invalid'
            )
          }
          const currentScope: Scope = {
            type: 'entity',
            agencyId: currentAgencyId,
            path: [{ type: 'transfer_payment', id: profileId }]
          }
          await authorizeWithFreshAuthContext(
            event,
            authContext,
            'transfer_payment',
            'create',
            async ({ context }) => {
              const canAccess = context.userAbilities.authorize(
                'transfer_payment',
                'create',
                currentScope
              )
              if (canAccess) return { bypass: true }
              return { scope: currentScope }
            }
          )

          if (validated.egcs_tp_active) {
            const normalizedNameEn = normalizeTextKey(validated.egcs_tp_name_en)
            const normalizedNameFr = normalizeTextKey(validated.egcs_tp_name_fr)
            const duplicateActiveStream = await trx
              .selectFrom('Transfer_Payment_Stream')
              .select('id')
              .where('egcs_tp_transferpaymentprofile', '=', profileId)
              .where('egcs_tp_active', '=', true)
              .where('_deleted', '=', false)
              .where(sql<boolean>`lower(btrim(egcs_tp_name_en)) = ${normalizedNameEn}`)
              .where(sql<boolean>`lower(btrim(egcs_tp_name_fr)) = ${normalizedNameFr}`)
              .executeTakeFirst()
            if (duplicateActiveStream) {
              return await badRequest(
                event,
                'TRANSFER_PAYMENT_DUPLICATE_PROGRAM_STREAM_NAME',
                'apiErrors.transfer_payment.duplicate_program_stream_name'
              )
            }
          }

          return await trx
            .insertInto('Transfer_Payment_Stream')
            .values({
              egcs_tp_transferpaymentprofile: profileId,
              egcs_tp_parentstream: validated.egcs_tp_parentstream ? String(validated.egcs_tp_parentstream) : null,
              egcs_tp_name_en: validated.egcs_tp_name_en,
              egcs_tp_name_fr: validated.egcs_tp_name_fr,
              egcs_tp_description_en: validated.egcs_tp_description_en,
              egcs_tp_description_fr: validated.egcs_tp_description_fr,
              egcs_tp_abbreviation_en: validated.egcs_tp_abbreviation_en,
              egcs_tp_abbreviation_fr: validated.egcs_tp_abbreviation_fr,
              egcs_tp_objective_en: validated.egcs_tp_objective_en,
              egcs_tp_objective_fr: validated.egcs_tp_objective_fr,
              egcs_tp_allowsfurtherdistribution: validated.egcs_tp_allowsfurtherdistribution,
              egcs_tp_active: validated.egcs_tp_active
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        })
      } catch (error: unknown) {
        if (!(error instanceof TransferPaymentStreamCreateScopeChanged)) {
          throw error
        }
        lockAgencyId = error.agencyId
      }
    }
    return await badRequest(event, 'TRANSFER_PAYMENT_PROFILE_SCOPE_CHANGED', 'apiErrors.transfer_payment.profile_scope_changed')
  } catch (error) {
    return await throwIfTransferPaymentUniqueConstraintError(event, error)
  }
})
