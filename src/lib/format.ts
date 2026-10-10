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
  return Number.isNaN(date.getTime()) ? '时间不可用' : (full ? fullDate : shortDate).format(date)
}
