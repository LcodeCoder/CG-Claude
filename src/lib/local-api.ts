export const LOCAL_READ_TIMEOUT_MS = 20_000
export const LOCAL_WRITE_TIMEOUT_MS = 180_000

interface ApiOptions {
  token: () => string
  connection: (connected: boolean, error: string) => void
  fetch?: typeof fetch
}

/** Reads fail promptly; configuration writes allow time for the native authorization dialog. */
export function createLocalApi(options: ApiOptions) {
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis)
  return async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const writing = Boolean(init.method && init.method.toUpperCase() !== 'GET')
    const timeout = AbortSignal.timeout(writing ? LOCAL_WRITE_TIMEOUT_MS : LOCAL_READ_TIMEOUT_MS)
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')
    const token = options.token()
    if (token) headers.set('X-CG-Token', token)
    let response: Response
    try {
      response = await transport('/api' + url, {
        ...init,
        headers,
        cache: 'no-store',
        signal: init.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
      })
    } catch (failure) {
      const timedOut =
        failure instanceof Error && ['TimeoutError', 'AbortError'].includes(failure.name)
      const message = writing
        ? '未收到操作结果；本机可能仍在处理。重新连接后核对进度与备份。'
        : timedOut
          ? '本机服务响应超时，请检查启动窗口后重新连接。'
          : '无法连接本机服务，请确认工具仍在运行。'
      options.connection(false, message)
      throw new Error(message)
    }
    let value: T
    try {
      if (!response.headers.get('Content-Type')?.includes('application/json'))
        throw new Error('响应格式不正确')
      value = (await response.json()) as T
    } catch {
      const message = writing
        ? '操作响应无法读取；重新连接后核对实际结果与备份。'
        : '本机服务响应无法读取，请重新连接。'
      options.connection(false, message)
      throw new Error(message)
    }
    options.connection(true, '')
    if (!response.ok) {
      const error = (value as { error?: unknown } | null)?.error
      throw new Error(typeof error === 'string' ? error : '本机服务没有完成操作')
    }
    return value
  }
}
