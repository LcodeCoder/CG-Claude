import type { BrowserSnapshot } from '../../shared/types'
export async function browserSnapshot(network: boolean): Promise<BrowserSnapshot> {
  const snapshot: BrowserSnapshot = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
  }
  if (!network) return snapshot
  const results = await Promise.allSettled([readPublicIp(), readWebrtc()])
  if (results[0]?.status === 'fulfilled') snapshot.publicIp = results[0].value as string
  else snapshot.publicIpError = '浏览器公网查询未完成，检查网络、扩展或跨域策略。'
  if (results[1]?.status === 'fulfilled')
    snapshot.webrtc = results[1].value as NonNullable<BrowserSnapshot['webrtc']>
  else
    snapshot.webrtc = {
      available: Boolean(window.RTCPeerConnection),
      tested: false,
      timedOut: false,
      candidates: [],
      error: '浏览器策略不允许此检测',
    }
  return snapshot
}
async function readPublicIp(): Promise<string> {
  const response = await fetch('https://api.ipify.org?format=json', {
    signal: AbortSignal.timeout(6500),
    cache: 'no-store',
    credentials: 'omit',
  })
  if (!response.ok) throw new Error('公网查询未完成')
  const value = (await response.json()) as { ip?: unknown }
  if (typeof value.ip !== 'string' || value.ip.length > 100) throw new Error('公网地址无效')
  return value.ip
}
async function readWebrtc(): Promise<NonNullable<BrowserSnapshot['webrtc']>> {
  if (!window.RTCPeerConnection)
    return { available: false, tested: false, timedOut: false, candidates: [] }
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
  const candidates: { address: string; type: string }[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    const collected = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true
        resolve()
      }, 4500)
      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          resolve()
          return
        }
        const candidate = event.candidate
        const address = candidate.address || candidate.candidate.split(' ')[4]
        if (
          address &&
          !candidates.some((item) => item.address === address && item.type === candidate.type)
        )
          candidates.push({ address, type: candidate.type || 'unknown' })
      }
      peer.onicegatheringstatechange = () => {
        if (peer.iceGatheringState === 'complete') resolve()
      }
    })
    peer.createDataChannel('environment-check')
    await peer.setLocalDescription(await peer.createOffer())
    await collected
    return { available: true, tested: true, timedOut, candidates: candidates.slice(0, 30) }
  } finally {
    if (timer) clearTimeout(timer)
    peer.close()
  }
}
