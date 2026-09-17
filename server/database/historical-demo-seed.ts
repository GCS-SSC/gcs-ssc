import type { Migration } from 'kysely'

// The applied seed is frozen against its historical schema. Keep this import
// opaque to TypeScript, but literal for the demo bundler.
export const up: Migration['up'] = async db => (await import('./migrations/9999_seed' as string)).up(db)
export const down: NonNullable<Migration['down']> = async db => (await import('./migrations/9999_seed' as string)).down(db)
