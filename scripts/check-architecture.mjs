import { promises as fs } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const projectRoot = path.resolve(import.meta.dirname, '..')
const roots = ['src', 'server', 'shared', 'electron']
const modules = new Map()
async function inventory(directory) {
  for (const entry of await fs.readdir(path.join(projectRoot, directory), {
    withFileTypes: true,
  })) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) await inventory(name)
    else if (/\.(?:ts|vue|cjs)$/.test(name))
      modules.set(name, await fs.readFile(path.join(projectRoot, name), 'utf8'))
  }
}
await Promise.all(roots.map(inventory))
const errors = []
const graph = new Map()
function resolveModule(file, specifier) {
  if (!specifier.startsWith('.')) return undefined
  const base = path.posix
    .normalize(path.posix.join(path.posix.dirname(file), specifier))
    .replace(/\.js$/, '.ts')
  return [base, base + '.ts', base + '.vue', base + '/index.ts'].find((candidate) =>
    modules.has(candidate),
  )
}
function allowed(file, target) {
  if (file.startsWith('shared/')) return target.startsWith('shared/')
  if (file.startsWith('src/')) return target.startsWith('src/') || target.startsWith('shared/')
  if (file.startsWith('server/'))
    return target.startsWith('server/') || target.startsWith('shared/')
  return true
}
for (const [file, content] of modules) {
  const source = file.endsWith('.vue')
    ? (content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '')
    : content
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const dependencies = new Set()
  function inspect(node) {
    const declaration = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
    const dynamic =
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    const expression = declaration ? node.moduleSpecifier : dynamic ? node.arguments[0] : undefined
    if (expression && ts.isStringLiteral(expression)) {
      const specifier = expression.text
      const target = resolveModule(file, specifier)
      const boundary =
        target ??
        (specifier.startsWith('.')
          ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
          : undefined)
      if (boundary && boundary !== 'package.json' && !allowed(file, boundary))
        errors.push(`${file} → ${boundary}：跨越分层边界`)

      if (file.startsWith('shared/') && !specifier.startsWith('.') && specifier !== 'zod')
        errors.push(`${file} → ${specifier}：共享规则必须可在浏览器和服务端使用`)
      if (file.startsWith('src/') && (specifier.startsWith('node:') || specifier === 'electron'))
        errors.push(`${file} → ${specifier}：前端不能直接调用本机设施`)
      if (/^src\/(?:views|components)\//.test(file) && target?.startsWith('src/composables/guard/'))
        errors.push(`${file} → ${target}：视图必须经公开 composable 调用`)
      if (
        file === 'server/storage.ts' &&
        target &&
        [
          'server/translation.ts',
          'server/browser-configuration.ts',
          'server/repairs.ts',
          'server/snapshots.ts',
          'server/workflows.ts',
        ].includes(target)
      )
        errors.push(`${file} → ${target}：存储层不能依赖业务服务`)
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly ||
          (node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            !node.importClause.name &&
            node.importClause.namedBindings.elements.every((entry) => entry.isTypeOnly))
        : ts.isExportDeclaration(node)
          ? node.isTypeOnly
          : false
      if (target && !typeOnly) dependencies.add(target)
    }
    ts.forEachChild(node, inspect)
  }
  inspect(parsed)
  graph.set(file, dependencies)
}
const complete = new Set()
const active = []
function visit(file) {
  if (complete.has(file)) return
  const cycle = active.indexOf(file)
  if (cycle !== -1) {
    errors.push('运行时循环依赖：' + [...active.slice(cycle), file].join(' → '))
    return
  }
  active.push(file)
  for (const target of graph.get(file) ?? []) visit(target)
  active.pop()
  complete.add(file)
}
for (const file of modules.keys()) visit(file)
if (errors.length) {
  console.error([...new Set(errors)].join('\n'))
  process.exitCode = 1
} else console.log(`架构检查通过：${modules.size} 个模块，分层边界与运行时依赖无循环。`)
