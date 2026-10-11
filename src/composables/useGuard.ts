import { createGuardContext } from './guard/context'
import { createGuardMonitors } from './guard/monitors'
import { createReviewsActions } from './guard/reviews'
import { createRepairActions } from './guard/repairs'
import { createConnectionActions } from './guard/connections'
import { createBrowserLanguageActions } from './guard/browser-language'
import { createTranslationActions } from './guard/translation'
import { createPreferencesActions } from './guard/preferences'
import { createSnapshotsActions } from './guard/snapshots'
import { createProjectsActions } from './guard/projects'
import { createTasksActions } from './guard/tasks'

/** Public facade for views. State, task monitoring and feature actions have separate owners. */
export function useGuard() {
  const context = createGuardContext()
  const monitors = createGuardMonitors(context)
  const reviews = createReviewsActions(context)
  const repairs = createRepairActions(context)
  const connections = createConnectionActions(context)
  const browserLanguage = createBrowserLanguageActions(context)
  const translation = createTranslationActions(context)
  const preferences = createPreferencesActions(context)
  const snapshots = createSnapshotsActions(context)
  const projects = createProjectsActions(context)
  const tasks = createTasksActions(context, monitors)
  return {
    boot: context.boot,
    report: context.report,
    plan: context.plan,
    setupPreview: context.setupPreview,
    setupJob: context.setupJob,
    snapshotPlan: context.snapshotPlan,
    projectReport: context.projectReport,
    captureSnapshot: snapshots.captureSnapshot,
    previewConnection: connections.previewConnection,
    applyConnection: connections.applyConnection,
    saveManualReview: reviews.saveManualReview,
    resetManualReviews: reviews.resetManualReviews,
    importLegacyReviews: reviews.importLegacyReviews,
    previewSnapshot: snapshots.previewSnapshot,
    restoreSnapshot: snapshots.restoreSnapshot,
    scanProject: projects.scanProject,
    prepareSetup: tasks.prepareSetup,
    startSetup: tasks.startSetup,
    loading: context.loading,
    remoteWorking: context.remoteWorking,
    scanning: context.scanning,
    working: context.working,
    connected: context.connected,
    error: context.error,
    progress: context.progress,
    toast: context.toast,
    selected: context.selected,
    availableFixes: context.availableFixes,
    canRepair: context.canRepair,
    reportConfigurationChanged: context.reportConfigurationChanged,
    busy: context.busy,
    initialize: tasks.initialize,
    scan: tasks.scan,
    preview: repairs.preview,
    apply: repairs.apply,
    restore: repairs.restore,
    savePreferences: preferences.savePreferences,
    openLocalAction: preferences.openLocalAction,
    saveTranslation: translation.saveTranslation,
    previewBrowserLanguage: browserLanguage.previewBrowserLanguage,
    applyBrowserLanguage: browserLanguage.applyBrowserLanguage,
    restoreBrowserLanguage: browserLanguage.restoreBrowserLanguage,
    testTranslation: translation.testTranslation,
    notify: context.notify,
    toggleFix: repairs.toggleFix,
  }
}
