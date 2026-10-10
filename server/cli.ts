import { parseArgs } from 'node:util'
import { createContext } from './context.js'
import { Storage } from './storage.js'
import { runDiagnostics } from './diagnostics.js'
import { markdownReport, redactReport } from './report.js'
const { values } = parseArgs({
  options: {
    network: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})
if (values.help)
  console.log(
    'CG Claude 本机检测\n\nnpm run doctor\nnpm run doctor -- --network   加入公网出口查询\nnpm run doctor -- --json      输出脱敏 JSON\n\n配置修复请通过本机界面预览并执行。',
  )
else {
  try {
    const ctx = createContext()
    const storage = new Storage(ctx)
    await storage.init()
    const report = redactReport(
      await runDiagnostics(ctx, await storage.preferences(), { network: values.network ?? false }),
    )
    console.log(values.json ? JSON.stringify(report, null, 2) : markdownReport(report))
    if (report.counts.fail > 0) process.exitCode = 2
  } catch (error) {
    console.error((error as Error).message)
    process.exitCode = 1
  }
}
