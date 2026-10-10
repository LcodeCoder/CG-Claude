import { spawn } from 'node:child_process'
const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const children = [
  spawn(runner, ['tsx', 'watch', 'server/index.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CG_DEV: '1' },
  }),
  spawn(runner, ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
]
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!closing) stop(code ?? 1)
  })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
