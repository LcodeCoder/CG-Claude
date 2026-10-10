import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-guard-demo-'))
const home = path.join(root, 'home')
await fs.mkdir(path.join(home, '.claude'), { recursive: true })
await fs.writeFile(
  path.join(home, '.zshrc'),
  '# 隔离测试用配置\nexport HTTPS_PROXY="http://127.0.0.1:7890"\nexport ANTHROPIC_BASE_URL="https://gateway.example/v1"\nexport PATH="$HOME/bin:$PATH"\n',
)
await fs.writeFile(
  path.join(home, '.npmrc'),
  'registry=https://registry.npmjs.org/\nproxy=http://127.0.0.1:7890\nhttps-proxy=http://127.0.0.1:7890\n',
)
await fs.writeFile(
  path.join(home, '.gitconfig'),
  '[user]\n  name = Guard Tester\n[http]\n  proxy = http://127.0.0.1:7890\n[core]\n  editor = vim\n',
)
await fs.writeFile(
  path.join(home, '.claude/settings.json'),
  JSON.stringify(
    {
      env: {
        ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
        ANTHROPIC_API_KEY: 'demo-credential-do-not-use',
      },
      permissions: { allow: ['Read'] },
      hooks: { Stop: [] },
    },
    null,
    2,
  ) + '\n',
)
const dataDir = path.join(root, 'data')
await fs.mkdir(dataDir, { mode: 0o700 })
await fs.writeFile(
  path.join(dataDir, 'preferences.json'),
  JSON.stringify({
    expectedTimezone: '',
    expectedCountry: '',
    routeMode: 'tun',
    usageMode: 'official',
    privacy: 'minimal',
  }),
  { mode: 0o600 },
)
const env = {
  ...process.env,
  CG_HOME: home,
  CG_DATA_DIR: dataDir,
  CG_PORT: process.env.CG_PORT || '4319',
  CG_DEMO: '1',
}
for (const key of Object.keys(env))
  if (
    /^(?:https?_proxy|all_proxy|no_proxy|ANTHROPIC_|CLAUDE_CODE_USE_|CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST$|CLAUDE_CONFIG_DIR$)/i.test(
      key,
    )
  )
    delete env[key]
console.log('隔离测试目录：' + root)
const desktop = process.argv.includes('--desktop')
const command = desktop ? createRequire(import.meta.url)('electron') : process.execPath
const args = desktop ? ['.'] : ['dist-server/server/index.js']
const child = spawn(command, args, { stdio: 'inherit', env })
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  child.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => {
  process.exitCode = code ?? 0
})
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
