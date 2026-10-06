import type { Migration } from 'kysely'

// Opaque to typechecking, literal for the separately packaged demo bundler.
export const up: Migration['up'] = async db => (await import('./migrations/9999_seed' as string)).up(db)
