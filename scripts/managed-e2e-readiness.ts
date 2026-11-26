import { lookup } from 'node:dns'
import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { stripVTControlCharacters } from 'node:util'
// Bun resolves the bare undici specifier to its built-in shim.
import { Agent, fetch as directFetch } from 'undici/index.js'

type ManagedServerProcess = {
  exited: Promise<number>
  exitCode: number | null
  signalCode: NodeJS.Signals | null
}

export type ManagedServerListening = Promise<URL> | {
  receipt: Promise<URL>
  ipv6Wildcard?: 'dual-stack'
  ipv6LoopbackUnavailable?: true
}

/**
 * Validates a managed client URL before it is used for port selection or health.
 *
 * @param value - Configured client URL.
 * @returns The parsed URL.
 */
export const parseManagedClientUrl = (value: string): URL => {
  const url = new URL(value)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const address = normalizeAddress(host)
  if (address === '0.0.0.0' || address === '::' || (host !== 'localhost' && !isIP(host))) {
    throw new Error('Use localhost, 127.0.0.1, or [::1] in PLAYWRIGHT_BASE_URL. Managed client URLs require localhost or a numeric non-wildcard address.')
  }
  return url
}

/**
 * Waits for a specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the timeout.
 */
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Forwards the child output and recognizes its first bound listening address.
 * Nitro logs this from its listen callback. Nuxt dev prints its local URL after binding.
 *
 * @param stdout - The directly owned child process output.
 * @param mode - The server implementation that writes the listening address.
 * @param write - Output sink, overridable in tests.
 * @returns The bound URL once the child reports it.
 */
export const observeManagedServerOutput = (
  stdout: ReadableStream<Uint8Array>,
  mode: 'production' | 'development',
  write: (chunk: Uint8Array) => void = chunk => { process.stdout.write(chunk) }
): Promise<URL> => {
  const listening = Promise.withResolvers<URL>()
  const decoder = new TextDecoder()
  const pattern = mode === 'production'
    ? /^Listening on (https?:\/\/\S+)$/
    : /^\s*➜\s+Local:\s+(https?:\/\/\S+)/
  let partial: string | null = ''
  /** Forwards all output and checks each complete line until the first listening address. */
  const drain = async () => {
    for await (const chunk of stdout) {
      write(chunk)
      if (partial === null) continue
      const lines = (partial + decoder.decode(chunk, { stream: true })).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        const address = pattern.exec(stripVTControlCharacters(line).trimEnd())?.[1]
        if (!address) continue
        listening.resolve(new URL(address))
        partial = null
        break
      }
    }
  }
  void drain().catch(listening.reject)
  return listening.promise
}

/**
 * Canonicalizes IPv6 literals and represents IPv4-mapped addresses as IPv4.
 *
 * @param address - The unbracketed address.
 * @returns The address used for listener comparisons.
 */
const normalizeAddress = (address: string): string => {
  if (isIP(address) !== 6) return address
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1)
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(canonical)
  return mapped
    ? mapped.slice(1).flatMap(part => {
        const value = Number.parseInt(part, 16)
        return [value >> 8, value & 255]
      }).join('.')
    : canonical
}

/**
 * Checks whether every address for the request can reach the reported listener.
 *
 * @param listener - The URL reported by the managed child.
 * @param destination - The URL Playwright will use.
 * @param dualStackWildcard - Whether the launcher guarantees a dual-stack wildcard bind.
 * @param ipv6LoopbackUnavailable - Whether a bind probe ruled out IPv6 loopback.
 * @returns Whether the listener covers the destination.
 */
const coversDestination = (
  listener: URL,
  destination: URL,
  dualStackWildcard: boolean,
  ipv6LoopbackUnavailable: boolean
): boolean => {
  const bound = normalizeAddress(listener.hostname.replace(/^\[|\]$/g, ''))
  const host = destination.hostname.replace(/^\[|\]$/g, '')
  // Browsers can resolve localhost to either loopback family independently of the OS lookup.
  const candidates = host === 'localhost'
    ? ipv6LoopbackUnavailable ? ['127.0.0.1'] : ['127.0.0.1', '::1']
    : [normalizeAddress(host)]

  const wildcard = bound === '::' || bound === '0.0.0.0'
  const local = wildcard
    ? new Set(Object.values(networkInterfaces()).flatMap(entries =>
        entries?.map(entry => normalizeAddress(entry.address)) ?? []
      ))
    : new Set<string>()
  return candidates.every(target => {
    if (target === bound) return true
    if (!wildcard || (bound === '0.0.0.0' && isIP(target) !== 4)) return false
    if (bound === '::' && isIP(target) === 4 && !dualStackWildcard) return false
    // Linux routes the whole IPv4 loopback block locally.
    return local.has(target) || (process.platform === 'linux' && target.startsWith('127.'))
  })
}

/**
 * Waits for the owned child to cover the requested destination and pass its health check.
 *
 * @param url - The URL to check.
 * @param timeoutMs - The timeout in milliseconds.
 * @param serverProcess - Managed server process whose early exit must fail startup.
 * @param listening - Owned child's receipt and any launcher guarantee for an IPv6 wildcard.
 * @param fetcher - Health request implementation, overridable for focused tests.
 * @param waiter - Poll-delay implementation, overridable for focused tests.
 * @returns A promise that resolves when the owned server passes the health check.
 * @throws Error if the server is not ready within the timeout.
 */
export const waitForManagedServerReady = async (
  url: string,
  timeoutMs: number,
  serverProcess: ManagedServerProcess,
  listening: ManagedServerListening,
  fetcher?: typeof fetch,
  waiter: (ms: number) => Promise<void> = wait
): Promise<void> => {
  const expected = parseManagedClientUrl(url)
  const listenerDetails = 'receipt' in listening ? listening : { receipt: listening }
  const { receipt, ipv6Wildcard, ipv6LoopbackUnavailable } = listenerDetails
  const controller = new AbortController()
  const dispatcher = fetcher
    ? undefined
    : new Agent(expected.hostname === 'localhost'
        ? {
            connect: {
              lookup: (_hostname, options, callback) => lookup('127.0.0.1', options, callback)
            }
          }
        : {})
  const timeout = Promise.withResolvers<{ kind: 'timeout' }>()
  const timer = setTimeout(() => timeout.resolve({ kind: 'timeout' }), timeoutMs)
  const serverExit = serverProcess.exited.then(exitCode => ({ exitCode, kind: 'exit' as const }))
  const startupFailure = Promise.race([serverExit, timeout.promise])
  /**
   * Reports the observed child exit code or signal.
   * @param exitCode - Status returned by the owned child.
   * @returns Never returns.
   */
  const throwExitedBeforeReady = (exitCode: number): never => {
    const exit = serverProcess.signalCode
      ? `signal ${serverProcess.signalCode} (managed exit ${exitCode})`
      : `exit code ${serverProcess.exitCode ?? exitCode}`
    throw new Error(`Managed server exited before becoming ready at ${url}: ${exit}.`)
  }
  const portOf = (address: URL) => address.port || (address.protocol === 'https:' ? '443' : '80')
  /**
   * Reports the event that prevented startup.
   * @param result - The process exit or timeout.
   * @returns Never returns.
   */
  const rejectStartupFailure = (result: Awaited<typeof startupFailure>): never => {
    if (result.kind === 'exit') return throwExitedBeforeReady(result.exitCode)
    throw new Error(`Timed out waiting for managed server at ${url}`)
  }
  try {
    const bound = await Promise.race([
      receipt.then(address => ({ kind: 'bound' as const, address })),
      startupFailure
    ])
    if (bound.kind !== 'bound') return rejectStartupFailure(bound)
    if (portOf(bound.address) !== portOf(expected) || bound.address.protocol !== expected.protocol) {
      throw new Error(`Managed server listened at ${bound.address.origin} instead of the expected protocol and port at ${expected.origin}.`)
    }
    if (!coversDestination(bound.address, expected, ipv6Wildcard === 'dual-stack', ipv6LoopbackUnavailable === true)) {
      throw new Error(`Managed server listener at ${bound.address.origin} does not cover ${expected.origin}.`)
    }
    while (true) {
      const options = { signal: controller.signal, redirect: 'error' as const }
      const request = fetcher
        ? fetcher(url, options)
        : directFetch(url, { ...options, dispatcher })
      const healthCheck = request
        .then(async response => {
          await response.body?.cancel()
          return response.ok ? { kind: 'ready' as const } : { kind: 'unavailable' as const }
        })
        .catch(() => ({ kind: 'unavailable' as const }))
      const health = await Promise.race([healthCheck, startupFailure])
      if (health.kind === 'exit' || health.kind === 'timeout') return rejectStartupFailure(health)
      if (health.kind === 'ready') {
        const current = await Promise.race([
          startupFailure,
          new Promise<{ kind: 'running' }>(resolve => setImmediate(() => resolve({ kind: 'running' })))
        ])
        if (current.kind !== 'running') return rejectStartupFailure(current)
        if (serverProcess.exitCode !== null) throwExitedBeforeReady(serverProcess.exitCode)
        return
      }
      const waited = await Promise.race([
        waiter(500).then(() => ({ kind: 'waited' as const })),
        startupFailure
      ])
      if (waited.kind !== 'waited') return rejectStartupFailure(waited)
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
    await dispatcher?.destroy()
  }
}
