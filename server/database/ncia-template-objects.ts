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
  const attachments = await db.selectFrom('Common_Attachment as attachment')
    .innerJoin('Common_Attachment_Types as type', 'type.id', 'attachment.egcs_cn_attachmenttype')
    .selectAll('attachment').select('type.egcs_cn_agency as agencyId')
    .where('attachment.egcs_cn_provider', '=', 'gcs-storage-local').where('attachment._deleted', '=', false).execute()
  const written: Array<{ provider: NonNullable<Awaited<ReturnType<typeof resolveAgencyStorageProvider>>>, reference: Awaited<ReturnType<typeof writeProviderObject>> }> = []
  try {
    for (const agencyId of [...new Set(attachments.map(attachment => String(attachment.agencyId)))]) {
      const provider = await resolveAgencyStorageProvider(db, agencyId, 'gcs-storage-local')
      if (!provider) throw new Error('Demo template restoration requires its enabled local file storage provider')
      for (const asset of assets) {
        for (const file of Object.values(asset.files)) {
          const attachment = attachments.find(row => String(row.agencyId) === agencyId && row.egcs_cn_filename === file.filename)
          if (!attachment) throw new Error(`Demo template attachment is missing: ${file.filename}`)
          const bytes = Buffer.from(file.bytes, 'base64')
          if (createHash('sha256').update(bytes).digest('hex') !== file.sha256
            || bytes.byteLength !== Number(attachment.egcs_cn_filesize)) {
            throw new Error(`Demo template bytes do not match their evidence: ${file.filename}`)
          }
          const reference = await writeProviderObject({
            provider, objectName: attachment.egcs_cn_providerobjectid, bytes,
            contentType: attachment.egcs_cn_mimetype, purpose: 'document-template'
          })
          written.push({ provider, reference })
          if (reference.objectId !== attachment.egcs_cn_providerobjectid
            || reference.locator.objectKey !== attachment.egcs_cn_providerobjectid) {
            throw new Error(`Demo template storage reference changed: ${file.filename}`)
          }
        }
      }
    }
  } catch (error) {
    await Promise.allSettled(written.map(({ provider, reference }) => deleteProviderObject({ provider, reference, purpose: 'document-template' })))
    throw error
  }
}
