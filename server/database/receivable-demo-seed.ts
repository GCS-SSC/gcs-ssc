import type { Migration } from 'kysely'

// Opaque to typechecking, literal for the standalone demo bundler.
export const up: Migration['up'] = async db => (await import('./migrations/0280_seed_accounts_receivable' as string)).up(db)
export const down: NonNullable<Migration['down']> = async db => (await import('./migrations/0280_seed_accounts_receivable' as string)).down(db)
