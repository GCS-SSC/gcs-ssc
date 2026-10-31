/* eslint-disable jsdoc/require-jsdoc -- Internal settlement tracking for external metadata mutations. */

export const observeStorageMetadataMutation = (promise: Promise<void>) => {
  const operation = { promise, settled: false }
  void promise.then(
    () => { operation.settled = true },
    () => { operation.settled = true }
  )
  return operation
}

export const releaseStorageMetadataAfterSettlement = async (
  operation: ReturnType<typeof observeStorageMetadataMutation> | undefined,
  release: () => Promise<unknown>
): Promise<void> => {
  if (!operation || operation.settled) {
    await release()
    return
  }
  // Keep the durable fence after timeout; a deadline does not cancel external effects.
  void operation.promise.then(release, release).catch(error => {
    console.error('Storage metadata settlement recovery failed.', { error })
  })
}
