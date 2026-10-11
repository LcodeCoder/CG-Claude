import { uiLanguage, translateUi } from '../i18n'
const shortDate = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const fullDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
export function formatDate(value: string, full = false): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? translateUi('时间不可用')
    : uiLanguage.value === 'en'
      ? new Intl.DateTimeFormat('en-US', {
          dateStyle: full ? 'medium' : 'short',
          timeStyle: full ? 'medium' : 'short',
        }).format(date)
      : (full ? fullDate : shortDate).format(date)
}
