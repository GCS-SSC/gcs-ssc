import { readFileSync } from 'node:fs'

const portalImagePattern = /^ghcr\.io\/gcs-ssc\/gcs-ssc-portal-demo-gcdesign@sha256:[a-f0-9]{64}$/

/**
 * Validate the Portal release pin and optional source commit provenance.
 * @param manifest Parsed release manifest.
 * @returns The immutable Portal image digest.
 */
export const parsePortalDemoImage = (manifest: unknown): string => {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || Object.keys(manifest).some(key => key !== 'image' && key !== 'commit')
    || !('image' in manifest) || typeof manifest.image !== 'string'
    || manifest.image.trim() !== manifest.image || !portalImagePattern.test(manifest.image)
    || ('commit' in manifest && (typeof manifest.commit !== 'string' || manifest.commit.length !== 40
      || !/^[a-f0-9]{40}$/i.test(manifest.commit)))) {
    throw new Error('Portal demo image must be a pinned GC Design System GHCR digest.')
  }
  return manifest.image
}

/**
 * Read the verified Portal demo release selected for Railway and AWS.
 * @returns The immutable Portal image digest.
 */
export const readPortalDemoImage = (): string => parsePortalDemoImage(
  JSON.parse(readFileSync(new URL('./portal-demo-image.json', import.meta.url), 'utf8'))
)
