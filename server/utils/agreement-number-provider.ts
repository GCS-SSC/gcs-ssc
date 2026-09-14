import type { GcsExtensionJsonConfig } from '@gcs-ssc/extensions'
import type { H3Event } from 'h3'
import type { Transaction, Kysely } from 'kysely'
import type { GcsAgreementNumberProvider, GcsAgreementNumberProviderContext } from '@gcs-ssc/extensions/server'
import { getGcsExtensions, loadGcsExtensionModule } from '#gcs-extensions/server-registry'
import { getExtensionStreamConfiguration, isExtensionEnabledForAgency, handleExtensionCreateOperationError } from './extensions'
import { badRequest } from './api-errors'
import type { Database } from '~~/shared/types/database'

/**
 * Resolves exactly one enabled provider using authoritative agency and stream ownership.
 * @param event - Authenticated request.
 * @param db - Active host database transaction.
 * @param agencyId - Resolved owning agency.
 * @param streamId - Resolved owning stream.
 * @returns The validated or generated result.
 */
export const resolveAgreementNumberProvider = async (event: H3Event, db: Kysely<Database>, agencyId: string, streamId: string) => {
  const providers = []
  for (const extension of await getGcsExtensions()) {
    if (!extension.agreementNumberProvider || !await isExtensionEnabledForAgency(db, extension.key, agencyId)) continue
    const stream = await getExtensionStreamConfiguration(db, extension.key, streamId)
    if (!stream.enabled) continue
    const agency = await db.selectFrom('extensions.agency_enablement').select('config')
      .where('extension_key', '=', extension.key).where('agency_id', '=', agencyId).where('_deleted', '=', false).executeTakeFirstOrThrow()
    providers.push({ contribution: extension.agreementNumberProvider, config: stream.config, agencyConfig: agency.config as GcsExtensionJsonConfig })
  }
  if (providers.length > 1) return await badRequest(event, 'AGREEMENT_NUMBER_PROVIDER_CONFLICT', 'apiErrors.agreement.number_provider_conflict')
  return providers[0] ?? null
}

/**
 * Calls the server-only provider on the active creation transaction.
 * @param event - Authenticated request.
 * @param db - Active host database transaction.
 * @param provider - Enabled server provider contribution.
 * @param context - Host-supplied transaction and configuration context.
 * @returns The validated or generated result.
 */
export const generateAgreementNumber = async (
  event: H3Event,
  db: Transaction<Database>,
  provider: NonNullable<Awaited<ReturnType<typeof resolveAgreementNumberProvider>>>,
  context: Omit<GcsAgreementNumberProviderContext, 'db' | 'config' | 'agencyConfig'>
): Promise<string> => {
  try {
    const module = await loadGcsExtensionModule(provider.contribution.id) as { default?: GcsAgreementNumberProvider }
    if (typeof module.default !== 'function') throw new Error('Agreement number provider is unavailable')
    const number = await module.default({ ...context, config: provider.config, agencyConfig: provider.agencyConfig, db: db as unknown as Transaction<unknown> })
    if (typeof number !== 'string' || !number.trim() || number !== number.trim() || Array.from(number).length > 15 || number.includes('\u0000')) {
      return await badRequest(event, 'INVALID_GENERATED_AGREEMENT_NUMBER', 'apiErrors.agreement.invalid_generated_number')
    }
    return number
  } catch (error) {
    await handleExtensionCreateOperationError(event, error)
    throw error
  }
}
