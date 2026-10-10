import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const require = createRequire(import.meta.url)
const env = { ...process.env }
if (
  env.ELECTRON_GET_USE_PROXY === undefined &&
  (env.HTTP_PROXY || env.HTTPS_PROXY || env.http_proxy || env.https_proxy)
)
  env.ELECTRON_GET_USE_PROXY = 'true'
const child = spawn(process.execPath, [require.resolve('electron/install.js')], {
  stdio: 'inherit',
  env,
})
child.on('error', (error) => {
  console.error('Electron 运行环境准备失败：' + error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
