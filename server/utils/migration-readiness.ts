import nodeProcess from 'node:process'

type MigrationReadiness = 'pending' | 'running' | 'ready' | 'failed'

interface MigrationGenerationState {
  databaseGenerationId: symbol
  promise: Promise<void>
  readiness: MigrationReadiness
}

const readinessStore = nodeProcess as NodeJS.Process & {
  __gcsSscMigrationGenerationState?: MigrationGenerationState
}

export const getMigrationReadiness = (): MigrationReadiness =>
  readinessStore.__gcsSscMigrationGenerationState?.readiness ?? 'pending'

/**
 * Returns the settled or active migration promise only for the requested database generation.
 *
 * @param databaseGenerationId - Exact database generation identity.
 * @returns Matching migration promise, when registered.
 */
export const getMigrationPromise = (databaseGenerationId: symbol): Promise<void> | undefined => {
  const state = readinessStore.__gcsSscMigrationGenerationState
  return state?.databaseGenerationId === databaseGenerationId ? state.promise : undefined
}

/**
 * Registers the initial running migration state for one database generation.
 *
 * @param databaseGenerationId - Exact database generation identity.
 * @param promise - Migration operation owned by that generation.
 */
export const registerMigrationPromise = (
  databaseGenerationId: symbol,
  promise: Promise<void>
): void => {
  const existingState = readinessStore.__gcsSscMigrationGenerationState
  if (existingState) {
    if (existingState.databaseGenerationId === databaseGenerationId && existingState.promise === promise) return
    throw new Error('Migration state is already registered for another database generation')
  }

  readinessStore.__gcsSscMigrationGenerationState = {
    databaseGenerationId,
    promise,
    readiness: 'running'
  }
}

/**
 * Updates readiness only while both the database generation and promise still match.
 *
 * @param databaseGenerationId - Exact database generation identity.
 * @param promise - Migration operation expected to own the current state.
 * @param readiness - New readiness value.
 */
export const setMigrationReadiness = (
  databaseGenerationId: symbol,
  promise: Promise<void>,
  readiness: MigrationReadiness
): void => {
  const state = readinessStore.__gcsSscMigrationGenerationState
  if (state?.databaseGenerationId === databaseGenerationId && state.promise === promise) {
    state.readiness = readiness
  }
}

/**
 * Clears migration state only for the synchronously detached database generation.
 *
 * @param databaseGenerationId - Exact detached database generation identity.
 */
export const clearMigrationStateForDatabaseGeneration = (databaseGenerationId: symbol): void => {
  if (readinessStore.__gcsSscMigrationGenerationState?.databaseGenerationId === databaseGenerationId) {
    delete readinessStore.__gcsSscMigrationGenerationState
  }
}
