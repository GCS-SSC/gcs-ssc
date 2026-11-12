/* eslint-disable jsdoc/require-jsdoc -- Internal settlement tracking for external metadata mutations. */

export const observeStorageMetadataMutation = (promise: Promise<void>) => {
  let state: 'pending' | 'settled' = 'pending'
  const operation = {
    promise,
    get state() {
      return state
    }
  }
  void promise.then(
    () => { state = 'settled' },
    () => { state = 'settled' }
  )
  return operation
}

export const releaseStorageMetadataAfterSettlement = async (
  operation: ReturnType<typeof observeStorageMetadataMutation> | undefined,
  release: () => Promise<unknown>
): Promise<void> => {
  if (!operation || operation.state === 'settled') {
    await release()
    return
  }
  // Keep the durable fence after timeout; a deadline does not cancel external effects.
  void operation.promise.then(release, release).catch(error => {
    console.error('Storage metadata settlement recovery failed.', { error })
  })
}
