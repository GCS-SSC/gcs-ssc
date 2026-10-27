import { setEncryptedExtensionSecret } from '@gcs-ssc/extensions/server'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { DEMO_EXTENSION_SECRETS_KEY } from './demo-extension-secrets'

const extensionKey = 'gcs-ssc-gcnotify'
const config = {
  mappings: [
    {
      templateId: 'bd0cc177-5006-4556-bd9f-408246caa775',
      notifierId: 'approval.action_required',
      recipientEmail: 'recipient_email',
      personalisation: {
        name: { fieldId: 'recipient_name', locale: 'en' },
        number: 'item_reference',
        date_en: 'item_title',
        date_fr: 'item_title',
        time_en: 'item_title',
        time_fr: 'item_title',
        address_en: 'approval_url',
        address_fr: 'approval_url'
      }
    }
  ]
}

/**
 * Seeds demo setup without a usable credential or external service calls.
 * @param db - Owning demo-seed database or transaction.
 * @param rootKey - Encryption key shared with the development runtime.
 */
export const seedNotificationDemo = async (
  db: Kysely<Database>,
  rootKey: string = process.env.GCS_EXTENSION_SECRETS_KEY ?? DEMO_EXTENSION_SECRETS_KEY
): Promise<void> => {
  for (const { agencyId, streamId } of [
    { agencyId: '21', streamId: '118' },
    { agencyId: '10021', streamId: '10118' }
  ]) {
    const agency = await db.selectFrom('Agency_Profile').select('id')
      .where('id', '=', agencyId).where('_deleted', '=', false).executeTakeFirst()
    if (!agency) continue

    await db.insertInto('extensions.agency_enablement').values({
      agency_id: agencyId, extension_key: extensionKey, enabled: true, config: {}
    }).onConflict(conflict => conflict.doNothing()).execute()

    const stream = await db.selectFrom('Transfer_Payment_Stream as stream')
      .innerJoin('Transfer_Payment_Profile as profile', 'profile.id', 'stream.egcs_tp_transferpaymentprofile')
      .select('stream.id').where('stream.id', '=', streamId).where('profile.egcs_tp_agency', '=', agencyId)
      .where('stream._deleted', '=', false).where('profile._deleted', '=', false).executeTakeFirst()
    if (stream) {
      await db.insertInto('extensions.stream_configuration').values({
        stream_id: streamId, extension_key: extensionKey, enabled: true, config
      }).onConflict(conflict => conflict.doNothing()).execute()
    }
    await db.insertInto('extensions.agency_notification_selection').values({
      agency_id: agencyId, provider_key: extensionKey, updated_at: null
    }).onConflict(conflict => conflict.doNothing()).execute()

    const credential = await db.selectFrom('extensions.secret_entry').select('id')
      .where('extension_key', '=', extensionKey).where('owner_type', '=', 'agency')
      .where('owner_id', '=', agencyId).where('secret_key', '=', 'api-key')
      .where('_deleted', '=', false).executeTakeFirst()
    if (!credential) {
      await setEncryptedExtensionSecret(db, {
        rootKey, extensionKey, ownerType: 'agency', ownerId: agencyId, secretKey: 'api-key',
        value: { apiKey: 'dummykey' }, metadata: { configured: false }
      })
    }
  }
}
