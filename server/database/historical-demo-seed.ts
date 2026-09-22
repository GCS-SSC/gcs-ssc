import type { Migration } from 'kysely'

// Keep the seed import opaque to TypeScript, but literal for the demo bundler.
export const up: Migration['up'] = async db => (await import('./migrations/0240_seed' as string)).up(db)
export const down: NonNullable<Migration['down']> = async db => (await import('./migrations/0240_seed' as string)).down(db)
