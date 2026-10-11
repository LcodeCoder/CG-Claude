import { appSettingsSchema } from '../../../shared/app-settings.js'
import { preferencesSchema, repairRequestSchema } from '../../../shared/types.js'
import { connectionRequestSchema } from '../../../shared/connections.js'
import { translationRequestSchema } from '../../../shared/translation.js'
import { browserLanguageRequestSchema } from '../../../shared/browser-configuration.js'
import { openLocalAction } from '../../local-actions.js'
import type { Application } from '../../application.js'
import type { RouteHandler } from '../kernel.js'

export function configurationRoutes(app: Application): RouteHandler {
  const { ctx, storage, repairs, snapshots, translation, browserLanguages, mutate: mutation } = app
  return async ({ req, res, url, send, body }) => {
    if (req.method === 'GET' && url.pathname === '/api/app-settings') {
      send(res, 200, await storage.appSettings())
      return true
    }
    if (req.method === 'PUT' && url.pathname === '/api/app-settings') {
      const request = appSettingsSchema.parse(await body(req))
      await mutation(() => storage.saveAppSettings(request))
      send(res, 200, request)
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/version-check') {
      await body(req)
      send(res, 200, await app.versions.check())
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/local-actions') {
      send(res, 200, await openLocalAction(ctx, await body(req)))
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/browser-language/preview') {
      const request = browserLanguageRequestSchema.parse(await body(req))
      send(res, 200, await mutation(() => browserLanguages.preview(request)))
      return true
    }
    const browserApply = url.pathname.match(/^\/api\/browser-language\/([\w-]+)\/apply$/)
    if (req.method === 'POST' && browserApply) {
      await body(req)
      send(res, 200, await mutation(() => browserLanguages.apply(browserApply[1]!)))
      return true
    }
    const browserRestore = url.pathname.match(
      /^\/api\/browser-language\/backups\/([\w-]+)\/restore$/,
    )
    if (req.method === 'POST' && browserRestore) {
      await body(req)
      send(res, 200, await mutation(() => browserLanguages.restore(browserRestore[1]!)))
      return true
    }
    if (req.method === 'GET' && url.pathname === '/api/translation/settings') {
      send(res, 200, await translation.configuration())
      return true
    }
    if (req.method === 'PUT' && url.pathname === '/api/translation/settings') {
      const request = translationRequestSchema.parse(await body(req))
      send(res, 200, await mutation(() => translation.save(request)))
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/translation/test') {
      const request = translationRequestSchema.parse(await body(req))
      send(res, 200, await mutation(() => translation.test(request)))
      return true
    }

    if (req.method === 'PUT' && url.pathname === '/api/preferences') {
      const preferences = preferencesSchema.parse(await body(req))
      if (preferences.expectedTimezone) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: preferences.expectedTimezone })
        } catch {
          throw new Error('期望时区不是有效的 IANA 时区')
        }
      }
      await mutation(() => storage.savePreferences(preferences))
      send(res, 200, preferences)
      return true
    }

    if (req.method === 'POST' && url.pathname === '/api/connections/preview') {
      const request = connectionRequestSchema.parse(await body(req))
      send(
        res,
        200,
        await mutation(async () => repairs.previewConnection(request, await storage.preferences())),
      )
      return true
    }
    const connectionApply = url.pathname.match(/^\/api\/connections\/([\w-]+)\/apply$/)
    if (req.method === 'POST' && connectionApply) {
      await body(req)
      send(
        res,
        200,
        await mutation(async () =>
          repairs.applyConnection(connectionApply[1]!, await storage.preferences(), snapshots),
        ),
      )
      return true
    }
    if (req.method === 'POST' && url.pathname === '/api/repairs/preview') {
      const request = repairRequestSchema.parse(await body(req))
      const plan = await mutation(async () =>
        repairs.preview(request.fixIds, await storage.preferences()),
      )
      send(res, 200, plan)
      return true
    }
    const applyMatch = url.pathname.match(/^\/api\/repairs\/([\w-]+)\/apply$/)
    if (req.method === 'POST' && applyMatch) {
      await body(req)
      const summary = await mutation(async () =>
        repairs.apply(applyMatch[1]!, await storage.preferences()),
      )
      send(res, 200, summary)
      return true
    }
    const restoreMatch = url.pathname.match(/^\/api\/backups\/([\w-]+)\/restore$/)
    if (req.method === 'POST' && restoreMatch) {
      await body(req)
      const summary = await mutation(() => repairs.restore(restoreMatch[1]!))
      send(res, 200, summary)
      return true
    }
    return false
  }
}
