/** Run the complete repository build and bind its client artifacts to their public environment. */

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  CLIENT_BUILD_RECORD_PATH,
  clientBuildProcessEnvironment,
  repositoryCommitHash,
  resolveClientBuildEnvironment,
  writeClientBuildRecord,
} from './client-build-environment.ts'

/** Run one package script through the package manager that invoked this build. */
function runScript(script: string, environment: NodeJS.ProcessEnv): void {
  const packageManager = process.env.npm_execpath
  if (packageManager === undefined || packageManager === '') {
    throw new Error('build: npm_execpath is unavailable; invoke the build through a package script')
  }
  // npm_execpath lands in three shapes across platforms and install modes: a
  // native binary (`pnpm.exe` — spawn it directly, node cannot exec it), a JS
  // entry (`.cjs`/`.mjs`/`.js` — run under this node), or a Windows shell shim
  // (`.cmd`/`.bat` from a `node_modules/.bin` style path — only cmd.exe can
  // launch those). Anything else falls back to node, matching the historical
  // behavior for POSIX extensionless entries.
  const lower = packageManager.toLowerCase()
  const isNativeExe = lower.endsWith('.exe')
  const isShellShim = lower.endsWith('.cmd') || lower.endsWith('.bat')
  const command = isNativeExe
    ? packageManager
    : isShellShim
      ? resolve(process.env.ComSpec ?? `${process.env.SystemRoot ?? ''}\\System32\\cmd.exe`)
      : process.execPath
  const args = isNativeExe
    ? ['run', script]
    : isShellShim
      ? ['/d', '/s', '/c', `"${packageManager}" run ${script}`]
      : [packageManager, 'run', script]
  const result = spawnSync(command, args, {
    cwd: resolve(import.meta.dirname, '..'),
    env: environment,
    stdio: 'inherit',
    // The shim arm passes one pre-joined, already-quoted command line; without
    // this flag Windows would re-quote the outer quotes and mangle the path.
    ...(isShellShim ? { windowsVerbatimArguments: true } : {}),
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`build: ${script} exited with ${String(result.status ?? result.signal)}`)
  }
}

/** Run the full build selected by `--profile` or `DSH_BUILD_CLIENT_PROFILE`. */
function main(): void {
  const { values } = parseArgs({
    options: { profile: { type: 'string' } },
    allowPositionals: false,
  })
  const root = resolve(import.meta.dirname, '..')
  const parentEnvironment = {
    ...process.env,
    DSH_CLIENT_COMMIT_HASH: repositoryCommitHash(root, process.env),
  }
  const clientEnvironment = resolveClientBuildEnvironment(parentEnvironment, values.profile)
  const buildEnvironment = clientBuildProcessEnvironment(parentEnvironment, clientEnvironment)

  rmSync(resolve(root, CLIENT_BUILD_RECORD_PATH), { force: true })
  runScript('build:lib', buildEnvironment)
  runScript('build:web', buildEnvironment)
  const record = writeClientBuildRecord(root, clientEnvironment)
  console.log(
    `build: recorded ${String(record.artifacts.fileCount)} client artifact(s) with ${String(Object.keys(record.environment).length)} public value(s)`,
  )
}

if (import.meta.main) main()
