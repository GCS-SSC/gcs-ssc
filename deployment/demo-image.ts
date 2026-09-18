import { readFileSync } from 'node:fs'

export const DEMO_IMAGE_PATTERN = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*-demo@sha256:[a-f0-9]{64}$/

/**
 * Validate the shared release pin; null retains Railway's existing source.
 * @param manifest - Parsed release manifest.
 * @returns Immutable demo image reference, or null before the first promotion.
 */
export const parseDemoImage = (manifest: unknown): string | null => {
  if (!manifest || typeof manifest !== 'object' || !('image' in manifest)) {
    throw new Error('Demo image manifest must contain an image property')
  }
  if (manifest.image === null) return null
  if (typeof manifest.image !== 'string' || !DEMO_IMAGE_PATTERN.test(manifest.image)) {
    throw new Error('Demo image must be a ghcr.io/owner/name-demo@sha256:<64 lowercase hex characters> reference')
  }
  return manifest.image
}

/**
 * Read the release pin shared by AWS and Railway.
 * @returns Validated demo image reference.
 */
export const readDemoImage = (): string | null => parseDemoImage(
  JSON.parse(readFileSync(new URL('./demo-image.json', import.meta.url), 'utf8'))
)
