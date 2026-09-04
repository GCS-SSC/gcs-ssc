import { existsSync } from 'node:fs'
import { lstat, mkdir, readlink, symlink } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

type LinkSpec = {
  link: string
  target: string
  kind: 'dir' | 'file'
}

const repositoryRoot = process.cwd()
const toolingRoot = resolve(repositoryRoot, 'tooling/gcs-ssc')

/**
 * Runs a setup subprocess and forwards its output and exit status.
 *
 * @param command Executable to run.
 * @param args Arguments passed to the executable.
 */
const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: 'inherit' })
  if (result.status === null) throw result.error ?? new Error(`${command} exited without a status`)
  if (result.status !== 0) process.exit(result.status)
}

/** Ensures the private tooling submodule is available at its pinned commit. */
const ensurePrivateToolingCheckout = (): void => {
  if (existsSync(resolve(toolingRoot, 'SKILL.md'))) return
  run('git', ['submodule', 'update', '--init', '--recursive', '--', 'tooling/gcs-ssc'])
  if (!existsSync(resolve(toolingRoot, 'SKILL.md'))) {
    throw new Error('The private tooling submodule is unavailable after initialization. Confirm your GitHub account can read GCS-SSC/gcs-ssc-tooling.')
  }
}

/**
 * Creates one expected link without replacing unrelated filesystem content.
 *
 * @param spec Link and target definition.
 * @param spec.link Repository-relative link path.
 * @param spec.target Repository-relative target path.
 * @param spec.kind Filesystem kind used for the Linux symlink.
 */
const ensureLink = async (spec: LinkSpec): Promise<void> => {
  const { link, target, kind } = spec
  const absoluteLink = resolve(repositoryRoot, link)
  const absoluteTarget = resolve(repositoryRoot, target)
  await mkdir(dirname(absoluteLink), { recursive: true })

  const status = await lstat(absoluteLink).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (status) {
    if (!status.isSymbolicLink()) throw new Error(`Refusing to replace non-symlink path: ${link}`)
    const existingTarget = resolve(dirname(absoluteLink), await readlink(absoluteLink))
    if (existingTarget !== absoluteTarget) throw new Error(`Refusing to retarget existing symlink: ${link}`)
    return
  }

  await symlink(relative(dirname(absoluteLink), absoluteTarget), absoluteLink, kind)
}

ensurePrivateToolingCheckout()

const links: LinkSpec[] = [
  { link: 'tests', target: 'tooling/gcs-ssc/tests', kind: 'dir' },
  { link: 'architecture', target: 'tooling/gcs-ssc/architecture', kind: 'dir' },
  { link: '.agents/skills/gcs-ssc', target: 'tooling/gcs-ssc', kind: 'dir' },
  ...['app', 'server', 'shared', 'i18n', 'modules', 'packages', 'eslint-rules'].map(name => ({
    link: `tooling/gcs-ssc/${name}`,
    target: name,
    kind: 'dir' as const
  })),
  { link: 'tooling/gcs-ssc/host-scripts', target: 'scripts', kind: 'dir' },
  ...[
    'vitest.config.ts',
    'vitest.extension-lifecycle-runtime.config.ts',
    'vitest.host-critical-base.ts',
    'vitest.workflow-runtime.config.ts'
  ].map(name => ({
    link: `tooling/gcs-ssc/${name}`,
    target: name,
    kind: 'file' as const
  }))
]

for (const link of links) await ensureLink(link)
console.info(`Private tooling is ready at ${relative(repositoryRoot, toolingRoot)}.`)
