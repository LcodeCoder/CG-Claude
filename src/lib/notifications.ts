import type { InjectionKey, Ref } from 'vue'

export interface GuardNotification {
  message: string
  kind: 'success' | 'error'
}

/** Modal feedback must live inside the native dialog's top layer. */
export const notificationKey: InjectionKey<Readonly<Ref<GuardNotification | undefined>>> =
  Symbol('guard-notification')
