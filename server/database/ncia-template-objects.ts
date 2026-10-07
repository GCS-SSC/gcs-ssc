import { createHash } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '~~/shared/types/database'
import { deleteProviderObject, resolveAgencyStorageProvider, writeProviderObject } from '../utils/file-storage-provider'

interface TemplateAsset {
  slug: string
  files: Record<'en' | 'fr', { filename: string, bytes: string, sha256: string }>
}

/**
 * Restores the historical bilingual template files through the selected storage SDK.
 * @param db - Fresh demo database or its restoration transaction.
 */
export const restoreNciaTemplateObjects = async (db: Kysely<Database>): Promise<void> => {
  const { default: assets } = await import('./seeds/ncia-document-templates.json' as string) as { default: TemplateAsset[] }
  const provider = await resolveAgencyStorageProvider(db, '21', 'gcs-storage-local')
  if (!provider) throw new Error('NCIA demo requires its enabled local file storage provider')
  const attachments = await db.selectFrom('Common_Attachment').selectAll()
    .where('egcs_cn_provider', '=', provider.extension.key).where('_deleted', '=', false).execute()
  const written: Array<Awaited<ReturnType<typeof writeProviderObject>>> = []
  try {
    for (const asset of assets) {
      for (const file of Object.values(asset.files)) {
        const attachment = attachments.find(row => row.egcs_cn_filename === file.filename)
        if (!attachment) throw new Error(`NCIA template attachment is missing: ${file.filename}`)
        const bytes = Buffer.from(file.bytes, 'base64')
        if (createHash('sha256').update(bytes).digest('hex') !== file.sha256
          || bytes.byteLength !== Number(attachment.egcs_cn_filesize)) {
          throw new Error(`NCIA template bytes do not match their evidence: ${file.filename}`)
        }
        const reference = await writeProviderObject({
          provider, objectName: attachment.egcs_cn_providerobjectid, bytes,
          contentType: attachment.egcs_cn_mimetype, purpose: 'document-template'
        })
        written.push(reference)
        if (reference.objectId !== attachment.egcs_cn_providerobjectid
          || reference.locator.objectKey !== attachment.egcs_cn_providerobjectid) {
          throw new Error(`NCIA template storage reference changed: ${file.filename}`)
        }
      }
    }
  } catch (error) {
    await Promise.allSettled(written.map(reference => deleteProviderObject({ provider, reference, purpose: 'document-template' })))
    throw error
  }
}
