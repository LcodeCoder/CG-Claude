import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Context } from './context.js'
import type { Storage } from './storage.js'
import { hash } from './safety.js'
import { readBoundedText } from './file-reading.js'
import { browserLanguageRequestSchema } from '../shared/browser-configuration.js'
import type {
  BrowserLanguageRequest,
  BrowserProfile,
  BrowserLanguagePreview,
  BrowserLanguageBackup,
  BrowserLanguageConfiguration,
} from '../shared/browser-configuration.js'
const browserSpecs = [
  {
    id: 'chrome',
    title: 'Chrome',
    mac: 'Google/Chrome',
    linux: 'google-chrome',
    windows: 'Google/Chrome/User Data',
    process: 'Google Chrome',
    exe: 'chrome.exe',
    domain: 'com.google.Chrome',
  },
  {
    id: 'edge',
    title: 'Microsoft Edge',
    mac: 'Microsoft Edge',
    linux: 'microsoft-edge',
    windows: 'Microsoft/Edge/User Data',
    process: 'Microsoft Edge',
    exe: 'msedge.exe',
    domain: 'com.microsoft.edgemac',
  },
  {
    id: 'brave',
    title: 'Brave',
    mac: 'BraveSoftware/Brave-Browser',
    linux: 'BraveSoftware/Brave-Browser',
    windows: 'BraveSoftware/Brave-Browser/User Data',
    process: 'Brave Browser',
    exe: 'brave.exe',
    domain: 'com.brave.Browser',
  },
  {
    id: 'chromium',
    title: 'Chromium',
    mac: 'Chromium',
    linux: 'chromium',
    windows: 'Chromium/User Data',
    process: 'Chromium',
    exe: 'chromium.exe',
    domain: 'org.chromium.Chromium',
  },
] as const
type BrowserSpec = (typeof browserSpecs)[number]
type ProfileTarget = { spec: BrowserSpec; name: string; filename: string; id: string }
type ProfileFile = {
  content: string
  mode: number
  data: Record<string, unknown>
  intl: Record<string, unknown>
  selected: string | null
  accepted: string | null
}
type Prepared = {
  preview: BrowserLanguagePreview
  target: ProfileTarget
  before: ProfileFile
  beforeAppLanguages?: string[] | null
}
function root(ctx: Context, spec: BrowserSpec) {
  return ctx.platform === 'darwin'
    ? path.join(ctx.home, 'Library/Application Support', spec.mac)
    : ctx.platform === 'win32'
      ? path.join(ctx.home, 'AppData/Local', spec.windows)
      : path.join(ctx.home, '.config', spec.linux)
}
/** All file targets are reconstructed from fixed browser roots, never supplied by the renderer. */
function target(ctx: Context, spec: BrowserSpec, name: string): ProfileTarget {
  if (!/^(?:Default|Profile \d{1,4})$/.test(name)) throw new Error('不支持此浏览器用户配置路径')
  return {
    spec,
    name,
    filename: path.join(root(ctx, spec), name, 'Preferences'),
    id: hash(spec.id + ':' + name).slice(0, 24),
  }
}
async function assertPath(ctx: Context, filename: string) {
  const relative = path.relative(ctx.home, filename)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('浏览器配置必须位于当前用户目录')
  let current = ctx.home
  for (const entry of relative.split(path.sep)) {
    current = path.join(current, entry)
    const stat = await fs.lstat(current)
    if (
      stat.isSymbolicLink() ||
      (!stat.isDirectory() && !stat.isFile()) ||
      (stat.isFile() && stat.nlink !== 1)
    )
      throw new Error('浏览器配置路径包含链接或非普通文件，未修改')
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
async function readProfile(ctx: Context, profile: ProfileTarget): Promise<ProfileFile> {
  await assertPath(ctx, profile.filename)
  const { text: content } = await readBoundedText(profile.filename, 8 * 1024 * 1024)
  const data: unknown = JSON.parse(content)
  if (!object(data) || (data.intl !== undefined && !object(data.intl)))
    throw new Error('浏览器语言配置格式异常，未修改')
  const intl = (data.intl ?? {}) as Record<string, unknown>
  if (intl.selected_languages !== undefined && typeof intl.selected_languages !== 'string')
    throw new Error('浏览器语言字段类型异常，未修改')
  if (intl.accept_languages !== undefined && typeof intl.accept_languages !== 'string')
    throw new Error('浏览器生效语言字段类型异常，未修改')
  if (intl.forced_languages !== undefined && !Array.isArray(intl.forced_languages))
    throw new Error('浏览器组织语言字段类型异常，未修改')
  if (Array.isArray(intl.forced_languages) && intl.forced_languages.length)
    throw new Error('浏览器存在组织强制语言，请通过组织设置修改')
  const selected = (intl.selected_languages ?? null) as string | null
  const accepted = (intl.accept_languages ?? null) as string | null
  if (accepted !== null && accepted.length > 1600) throw new Error('浏览器生效语言列表过长，未修改')
  if (selected !== null && selected.length > 1600) throw new Error('浏览器语言列表过长，未修改')
  return {
    content,
    mode: (await fs.lstat(profile.filename)).mode & 0o777,
    data,
    intl,
    selected,
    accepted,
  }
}
export function sealBrowserBackup(
  record: Omit<BrowserLanguageBackup, 'integrity'> | BrowserLanguageBackup,
) {
  const { integrity: _ignored, ...data } = record as BrowserLanguageBackup
  return hash(JSON.stringify(data, Object.keys(data).sort()))
}
export class BrowserLanguageEngine {
  private plans = new Map<string, Prepared>()
  private demoAppLanguages = new Map<string, string[] | null>()
  constructor(
    private ctx: Context,
    private storage: Storage,
  ) {}
  private async targets() {
    const profiles: ProfileTarget[] = []
    for (const spec of browserSpecs) {
      try {
        const directory = root(this.ctx, spec)
        await assertPath(this.ctx, directory)
        for (const name of (await fs.readdir(directory))
          .filter((name) => /^(?:Default|Profile \d{1,4})$/.test(name))
          .slice(0, 50))
          profiles.push(target(this.ctx, spec, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error(`${spec.title} 用户目录不可安全读取`)
      }
    }
    return profiles
  }
  private describe(profile: ProfileTarget, file?: ProfileFile, problem?: string): BrowserProfile {
    return {
      id: profile.id,
      title: `${profile.spec.title} · ${profile.name === 'Default' ? '默认用户' : profile.name}`,
      selected: file?.selected ?? '跟随浏览器默认',
      effective:
        typeof file?.intl.accept_languages === 'string'
          ? file.intl.accept_languages
          : '重开浏览器后核对',
      file: '~/' + path.relative(this.ctx.home, profile.filename).split(path.sep).join('/'),
      appLanguageSupported: this.ctx.platform === 'darwin',
      ...(problem ? { problem } : {}),
    }
  }
  async configuration(): Promise<BrowserLanguageConfiguration> {
    const profiles: BrowserProfile[] = []
    const problems: string[] = []
    try {
      for (const profile of await this.targets()) {
        try {
          profiles.push(this.describe(profile, await readProfile(this.ctx, profile)))
        } catch {
          profiles.push(this.describe(profile, undefined, '此用户配置无法安全读取，未修改'))
        }
      }
    } catch (error) {
      problems.push((error as Error).message)
    }
    return {
      profiles,
      problems,
      backups: (await this.storage.browserLanguageBackups()).map(
        ({ id, title, createdAt, status, language, appLanguage }) => ({
          id,
          title,
          createdAt,
          status,
          language,
          appLanguage,
        }),
      ),
    }
  }
  private async assertClosed(spec: BrowserSpec) {
    if (this.ctx.demo) return
    const result =
      this.ctx.platform === 'win32'
        ? await this.ctx.run('tasklist.exe', [
            '/FI',
            `IMAGENAME eq ${spec.exe}`,
            '/FO',
            'CSV',
            '/NH',
          ])
        : await this.ctx.run('/bin/ps', ['-axo', 'comm='])
    if (!result.ok) throw new Error('无法确认浏览器已完全退出，请检查本机命令权限')
    const running =
      this.ctx.platform === 'win32'
        ? result.stdout.toLowerCase().includes(spec.exe)
        : result.stdout.split(/\r?\n/).some((line) => {
            const name = path.basename(line.trim())
            return this.ctx.platform === 'darwin'
              ? name === spec.process || name.startsWith(spec.process + ' Helper')
              : [
                  'chrome',
                  'google-chrome',
                  'msedge',
                  'brave',
                  'brave-browser',
                  'chromium',
                  'chromium-browser',
                ].includes(name) &&
                  (spec.id === 'chrome'
                    ? /chrome/.test(name) && !/chromium/.test(name)
                    : spec.id === 'edge'
                      ? name === 'msedge'
                      : spec.id === 'brave'
                        ? /brave/.test(name)
                        : /chromium/.test(name))
          })
    if (running)
      throw new Error(`请先完全退出 ${spec.title}（macOS 使用 ⌘Q），再执行；不会自动关闭你的标签页`)
  }
  private async appLanguages(spec: BrowserSpec): Promise<string[] | null> {
    if (this.ctx.demo) return this.demoAppLanguages.get(spec.id) ?? null
    const filename = path.join(this.ctx.home, 'Library/Preferences', spec.domain + '.plist')
    try {
      await assertPath(this.ctx, filename)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    // Read only the app-language key, never export the browser's entire preferences domain.
    const result = await this.ctx.run('/usr/bin/plutil', [
      '-extract',
      'AppleLanguages',
      'json',
      '-o',
      '-',
      filename,
    ])
    if (!result.ok) {
      const check = await this.ctx.run('/usr/bin/plutil', ['-lint', filename])
      if (check.ok && /(?:No value at that key path|Could not extract value)/i.test(result.stdout))
        return null
      throw new Error('无法读取浏览器原应用语言，未修改')
    }
    const values = z
      .array(z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z\d]{1,8})*$/))
      .min(1)
      .max(30)
      .parse(JSON.parse(result.stdout))
    return values
  }
  private async writeAppLanguages(spec: BrowserSpec, value: string[] | null) {
    if (this.ctx.demo) {
      this.demoAppLanguages.set(spec.id, value)
      return
    }
    const args =
      value === null
        ? ['delete', spec.domain, 'AppleLanguages']
        : ['write', spec.domain, 'AppleLanguages', '-array', ...value]
    const result = await this.ctx.run('/usr/bin/defaults', args)
    if (!result.ok) throw new Error('浏览器应用语言保存未完成，请检查用户配置权限')
    if (JSON.stringify(await this.appLanguages(spec)) !== JSON.stringify(value))
      throw new Error('浏览器应用语言保存后复核失败')
  }
  async preview(request: BrowserLanguageRequest): Promise<BrowserLanguagePreview> {
    const input = browserLanguageRequestSchema.parse(request)
    const profile = (await this.targets()).find((profile) => profile.id === input.profileId)
    if (!profile) throw new Error('此浏览器用户配置已不存在，请重新刷新')
    const before = await readProfile(this.ctx, profile)
    if (input.appLanguage && this.ctx.platform !== 'darwin')
      throw new Error('此平台的浏览器应用语言请在浏览器设置中修改')
    const beforeAppLanguages = input.appLanguage ? await this.appLanguages(profile.spec) : undefined
    const after = [...new Set([input.language, 'en'])].join(',')
    const preview: BrowserLanguagePreview = {
      id: randomUUID(),
      profile: this.describe(profile, before),
      language: input.language,
      appLanguage: input.appLanguage,
      before: before.selected || before.accepted || '跟随浏览器默认',
      after,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
    for (const [id, plan] of this.plans)
      if (Date.parse(plan.preview.expiresAt) < Date.now()) this.plans.delete(id)
    if (this.plans.size > 30) this.plans.delete(this.plans.keys().next().value!)
    this.plans.set(preview.id, { preview, target: profile, before, beforeAppLanguages })
    return preview
  }
  private async write(
    profile: ProfileTarget,
    before: ProfileFile,
    selected: string | null,
    accepted?: string | null,
  ) {
    await this.assertClosed(profile.spec)
    const current = await readProfile(this.ctx, profile)
    if (hash(current.content) !== hash(before.content) || current.mode !== before.mode)
      throw new Error('浏览器配置在预览后发生变化，请重新预览')
    const data = structuredClone(current.data)
    const intl = { ...current.intl }
    if (selected === null) delete intl.selected_languages
    else intl.selected_languages = selected
    if (accepted === null) delete intl.accept_languages
    else if (accepted !== undefined) intl.accept_languages = accepted
    // Chromium derives accept_languages from selected_languages and organization policies at startup.
    if (Object.keys(intl).length) data.intl = intl
    else delete data.intl
    const temporary = profile.filename + '.cg-' + randomUUID() + '.tmp'
    try {
      await fs.writeFile(temporary, JSON.stringify(data) + '\n', { flag: 'wx', mode: current.mode })
      if (this.ctx.platform !== 'win32') await fs.chmod(temporary, current.mode)
      await this.assertClosed(profile.spec)
      const latest = await readProfile(this.ctx, profile)
      if (hash(latest.content) !== hash(before.content) || latest.mode !== before.mode)
        throw new Error('浏览器配置又被修改，请重新预览')
      await fs.rename(temporary, profile.filename)
      const saved = await readProfile(this.ctx, profile)
      if (saved.selected !== selected || (accepted !== undefined && saved.accepted !== accepted))
        throw new Error('浏览器语言保存后复核失败')
    } finally {
      await fs.unlink(temporary).catch(() => {})
    }
  }
  async apply(id: string) {
    const plan = this.plans.get(id)
    if (!plan || Date.parse(plan.preview.expiresAt) < Date.now())
      throw new Error('浏览器语言预览已过期，请重新预览')
    await this.assertClosed(plan.target.spec)
    const current = await readProfile(this.ctx, plan.target)
    if (hash(current.content) !== hash(plan.before.content) || current.mode !== plan.before.mode)
      throw new Error('浏览器配置在预览后发生变化，请重新预览')
    if (
      plan.preview.appLanguage &&
      JSON.stringify(await this.appLanguages(plan.target.spec)) !==
        JSON.stringify(plan.beforeAppLanguages)
    )
      throw new Error('浏览器应用语言在预览后发生变化，请重新预览')
    const record: BrowserLanguageBackup = {
      id: randomUUID(),
      browserId: plan.target.spec.id,
      profile: plan.target.name,
      title: plan.preview.profile.title,
      createdAt: new Date().toISOString(),
      status: 'prepared',
      language: plan.preview.language,
      appLanguage: plan.preview.appLanguage,
      beforeSelected: plan.before.selected,
      beforeAccepted: plan.before.accepted,
      afterSelected: plan.preview.after,
      ...(plan.preview.appLanguage
        ? {
            beforeAppLanguages: plan.beforeAppLanguages!,
            afterAppLanguages: plan.preview.after.split(','),
          }
        : {}),
      integrity: '',
    }
    record.integrity = sealBrowserBackup(record)
    await this.storage.saveBrowserLanguageBackup(record)
    try {
      await this.write(plan.target, plan.before, record.afterSelected)
      if (record.appLanguage)
        await this.writeAppLanguages(plan.target.spec, record.afterAppLanguages!)
      record.status = 'applied'
      record.integrity = sealBrowserBackup(record)
      await this.storage.saveBrowserLanguageBackup(record)
      this.plans.delete(id)
    } catch (error) {
      // Prepared backups remain visible so an interrupted write is recoverable.
      throw new Error(`${(error as Error).message}；修改前的语言备份已保留`)
    }
    return {
      backupId: record.id,
      message: `已保存 ${record.title} 的语言设置。重开该浏览器后，在同一浏览器中复检。`,
    }
  }
  async restore(id: string) {
    const record = (await this.storage.browserLanguageBackups()).find((record) => record.id === id)
    if (!record || record.status === 'restored') throw new Error('此浏览器语言备份不可还原')
    const spec = browserSpecs.find((spec) => spec.id === record.browserId)!
    const profile = target(this.ctx, spec, record.profile)
    await this.assertClosed(spec)
    const current = await readProfile(this.ctx, profile)
    if (current.selected !== record.afterSelected && current.selected !== record.beforeSelected)
      throw new Error('浏览器语言已被其他设置修改，未覆盖；请先核对')
    if (current.accepted !== record.beforeAccepted && current.accepted !== record.afterSelected)
      throw new Error('浏览器生效语言已被其他设置修改，未覆盖；请先核对')
    if (record.appLanguage) {
      const latest = await this.appLanguages(spec)
      if (
        JSON.stringify(latest) !== JSON.stringify(record.afterAppLanguages) &&
        JSON.stringify(latest) !== JSON.stringify(record.beforeAppLanguages)
      )
        throw new Error('浏览器应用语言已被其他设置修改，未覆盖')
    }
    if (current.selected !== record.beforeSelected || current.accepted !== record.beforeAccepted)
      await this.write(profile, current, record.beforeSelected, record.beforeAccepted)
    if (
      record.appLanguage &&
      JSON.stringify(await this.appLanguages(spec)) !== JSON.stringify(record.beforeAppLanguages)
    )
      await this.writeAppLanguages(spec, record.beforeAppLanguages!)
    record.status = 'restored'
    record.integrity = sealBrowserBackup(record)
    await this.storage.saveBrowserLanguageBackup(record)
    return { message: `已还原 ${record.title} 的原语言；重开浏览器后生效。` }
  }
}
