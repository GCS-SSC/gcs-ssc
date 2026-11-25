import { shallowReactive } from 'vue'

/**
 * Owns exclusive work by resource key. Eligibility and editor changes do not
 * release a lane. Only its acquiring operation can release it.
 *
 * @returns Pending lookup and acquisition with token-bound cleanup.
 */
export const useOperationLane = <Key>() => {
  const pending = shallowReactive(new Map<Key, symbol>())

  const hasPending = () => pending.size > 0
  const isPending = (key: Key) => pending.has(key)
  /**
   * @param key - Key of the resource that owns the operation.
   * @returns Cleanup for this acquisition, or null if the lane is occupied.
   */
  const acquire = (key: Key) => {
    if (pending.has(key)) return null
    const token = Symbol()
    pending.set(key, token)
    return () => {
      if (pending.get(key) === token) pending.delete(key)
    }
  }

  return { hasPending, isPending, acquire }
}
