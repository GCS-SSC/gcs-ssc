import { readFileSync } from 'node:fs'

const portalImagePattern = /^ghcr\.io\/gcs-ssc\/gcs-ssc-portal-demo-gcdesign@sha256:[a-f0-9]{64}$/

/**
 * Read the verified Portal demo release selected for the Railway project.
 * @returns The immutable Portal image digest.
 */
export const readPortalDemoImage = (): string => {
  const manifest: unknown = JSON.parse(readFileSync(new URL('./portal-demo-image.json', import.meta.url), 'utf8'))
  if (!manifest || typeof manifest !== 'object' || Object.keys(manifest).length !== 1
    || !('image' in manifest) || typeof manifest.image !== 'string'
    || !portalImagePattern.test(manifest.image)) {
    throw new Error('Portal demo image must be a pinned GC Design System GHCR digest.')
  }
  return manifest.image
}
