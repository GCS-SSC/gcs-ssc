const unsupportedBigintWarning = 'Big integer literals are not available in the configured target environment'

const build = Bun.spawn(['bun', 'x', 'nuxt', 'build'], {
  cwd: process.cwd(),
  env: process.env,
  stdout: 'pipe',
  stderr: 'pipe'
})

/**
 * Captures a build stream while preserving its normal terminal output.
 *
 * @param stream - Build output stream to consume.
 * @param write - Terminal writer used to forward each chunk.
 * @returns The complete decoded stream content.
 */
const captureAndForward = async (
  stream: ReadableStream<Uint8Array>,
  write: (chunk: Uint8Array) => boolean
): Promise<string> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let captured = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    captured += decoder.decode(value, { stream: true })
    write(value)
  }
  captured += decoder.decode()
  return captured
}

const [stdout, stderr, exitCode] = await Promise.all([
  captureAndForward(build.stdout, chunk => process.stdout.write(chunk)),
  captureAndForward(build.stderr, chunk => process.stderr.write(chunk)),
  build.exited
])

if (`${stdout}\n${stderr}`.includes(unsupportedBigintWarning)) {
  console.error('\nProduction build rejected: unsupported BigInt literal warning detected.')
  process.exitCode = 1
} else if (exitCode !== 0) {
  process.exitCode = exitCode
}
