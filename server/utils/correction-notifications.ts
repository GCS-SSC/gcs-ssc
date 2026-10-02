/* eslint-disable jsdoc/require-param -- Integration staging shares the locked outcome transaction and never delivers externally. */
import type { Transaction } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { GCS_EXTENSION_CORRECTION_OUTCOME_HOOK, type GcsExtensionCorrectionOutcomeContext } from '@gcs-ssc/extensions/server'
import { getExtensionConfigurationForEntity, getRegisteredExtensions } from './extensions'
import { resolveCorrectionRuntimeContext } from './correction-context'
import { formatCorrectionReference } from '~~/shared/utils/correction'

declare const useNitroApp: typeof import('nitropack/runtime').useNitroApp

/** Enabled integrations may insert their durable delivery requests using this transaction; workers deliver after commit. */
export const stageCorrectionOutcomeIntegrations = async (
  trx: Transaction<Database>, correctionId: string,
  notifications: Array<{ notificationId: string; commonUserId: string }>, runtimeId: string | null
): Promise<void> => {
  if (!notifications.length) return
  const context = await resolveCorrectionRuntimeContext(trx, correctionId)
  if (!context) throw new Error('Correction notification owner is unavailable')
  const correction = await trx.selectFrom('Funding_Case_Agreement_Correction')
    .select(['egcs_fc_agreementnumber', 'egcs_fc_number', 'egcs_fc_outcome', 'egcs_fc_terminalby', 'egcs_fc_terminalat'])
    .where('id', '=', correctionId).where('_deleted', '=', false).executeTakeFirstOrThrow()
  if (correction.egcs_fc_outcome === 'open' || !correction.egcs_fc_terminalat) throw new Error('Correction notifications require a recorded terminal outcome')
  const integrations = (await getRegisteredExtensions()).filter(extension => extension.requiredHostCapabilities.includes('extension-lifecycle-hooks'))
    .sort((left, right) => left.key.localeCompare(right.key))
  for (const extension of integrations) {
    const config = await getExtensionConfigurationForEntity(trx, extension.key, {
      target: 'agreement', agencyId: context.agencyId, streamId: context.streamId,
      agreementId: context.agreementId, ownerType: 'fundingcaseagreement', ownerId: context.agreementId, scope: context.scope
    })
    if (!config) continue
    const payload: GcsExtensionCorrectionOutcomeContext = {
      extensionKey: extension.key, db: trx as unknown as Transaction<unknown>, config,
      agencyId: context.agencyId, streamId: context.streamId, agreementId: context.agreementId, correctionId,
      reference: formatCorrectionReference(correction),
      outcome: correction.egcs_fc_outcome, runtimeId,
      decisionCommonUserId: correction.egcs_fc_terminalby === null ? null : String(correction.egcs_fc_terminalby),
      recordedAt: new Date(correction.egcs_fc_terminalat).toISOString(), notifications
    }
    await useNitroApp().hooks.callHook(GCS_EXTENSION_CORRECTION_OUTCOME_HOOK, payload)
  }
}
