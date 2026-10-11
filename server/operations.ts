import type { ServiceStatus } from '../shared/service-status.js'

export class ServiceOperationError extends Error {
  constructor(
    message: string,
    readonly status: 409 | 503,
  ) {
    super(message)
  }
}
type Activity = NonNullable<ServiceStatus['activity']>

/** One owner for local operations and shutdown, independent of HTTP and Electron. */
export class OperationCoordinator {
  private current?: Activity
  private pending: Promise<void> = Promise.resolve()
  private shuttingDown = false

  get busy() {
    return Boolean(this.current)
  }
  status(): ServiceStatus {
    return { closing: this.shuttingDown, ...(this.current ? { activity: this.current } : {}) }
  }

  async run<T>(activity: Activity, operation: () => Promise<T>): Promise<T> {
    if (this.shuttingDown)
      throw new ServiceOperationError('本机服务正在退出，请等待当前操作完成', 503)
    if (this.current)
      throw new ServiceOperationError('当前有检测或修改正在进行，请完成后再操作', 409)
    this.current = activity
    const result = Promise.resolve().then(operation)
    this.pending = result.then(
      () => {},
      () => {},
    )
    try {
      return await result
    } finally {
      this.current = undefined
    }
  }
  /** Return the prepared task immediately, retaining the lease through its execution. */
  start<T>(
    activity: Activity,
    prepare: () => Promise<T>,
    execute: (value: T) => Promise<void>,
    failed: (value: T, error: unknown) => Promise<void> | void,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      void this.run(activity, async () => {
        const value = await prepare()
        resolve(value)
        try {
          await execute(value)
        } catch (error) {
          await failed(value, error)
        }
      }).catch(reject)
    })
  }
  async close() {
    this.shuttingDown = true
    await this.pending
  }
}
