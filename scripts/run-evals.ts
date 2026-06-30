// Read the OpenRouter key from macOS keychain via the `security` CLI — avoids bun:ffi,
// which crashes in Bun 1.3.4 when run outside the Electrobun app process.
const keyProc = Bun.spawn({
  cmd: [
    '/usr/bin/security',
    'find-generic-password',
    '-s',
    'com.proxima.apikeys',
    '-a',
    'openrouter',
    '-w',
  ],
  stdio: ['inherit', 'pipe', 'pipe'],
})

const key = (await new Response(keyProc.stdout).text()).trim()
const keychainExit = await keyProc.exited

if (keychainExit !== 0 || !key) {
  console.error(
    'Error: No OpenRouter API key found in keychain. Add one in Proxima settings first.',
  )
  process.exit(1)
}

process.env.OPENROUTER_API_KEY = key

const passThrough = process.argv.slice(2)
const watch = passThrough.includes('--watch')
const extraArgs = passThrough.filter((a) => a !== '--watch')

const cmd = ['node', './node_modules/.bin/evalite', ...(watch ? ['watch'] : []), ...extraArgs]

const proc = Bun.spawn({
  cmd,
  env: { ...process.env } as Record<string, string>,
  stdio: ['inherit', 'inherit', 'inherit'],
})

process.exit(await proc.exited)
