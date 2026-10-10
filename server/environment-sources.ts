import { configTargets } from './context.js'
import type { Context } from './context.js'
import { claudeEnv, parseClaude, shellAssignments } from './configs.js'
import type { ConfigContent } from './safety.js'

export interface EnvironmentSource {
  label: string
  kind: 'process' | 'claude' | 'shell'
  values: Record<string, string>
  unresolved: string[]
  hasApiKeyHelper: boolean
}
export interface EnvironmentSources {
  sources: EnvironmentSource[]
  unavailable: string[]
}

/** Parse known literals without sourcing a shell or expanding user code. */
function literalValue(value: string): string {
  const match = value.match(/^(?:"([^"\n]*)"|'([^'\n]*)'|([^\s#]*))\s*(?:#.*)?$/)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
}

export function collectEnvironmentSources(
  ctx: Context,
  files: ConfigContent[],
): EnvironmentSources {
  const result: EnvironmentSources = {
    sources: [
      {
        label: 'CG Claude 当前进程',
        kind: 'process',
        values: Object.fromEntries(
          Object.entries(ctx.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
        unresolved: [],
        hasApiKeyHelper: false,
      },
    ],
    unavailable: [],
  }
  for (const file of files) {
    const kind = configTargets.find((target) => target.relative === file.relative)?.kind
    if (kind !== 'shell' && kind !== 'claude') continue
    if (!file.editable) {
      result.unavailable.push(file.display)
      continue
    }
    if (!file.exists) continue
    const source: EnvironmentSource = {
      label: file.display,
      kind,
      values: {},
      unresolved: [],
      hasApiKeyHelper: false,
    }
    if (kind === 'shell') {
      for (const assignment of shellAssignments(file.content ?? '')) {
        if (assignment.safe) source.values[assignment.key] = literalValue(assignment.value)
        else source.unresolved.push(assignment.key)
      }
    } else {
      try {
        const config = parseClaude(file.content)
        source.hasApiKeyHelper =
          typeof config.apiKeyHelper === 'string' && Boolean(config.apiKeyHelper.trim())
        for (const [key, value] of Object.entries(claudeEnv(config))) {
          if (typeof value === 'string') source.values[key] = value
          else source.unresolved.push(key)
        }
      } catch {
        result.unavailable.push(file.display)
        continue
      }
    }
    result.sources.push(source)
  }
  return result
}
