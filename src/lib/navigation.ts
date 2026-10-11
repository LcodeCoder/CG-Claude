export async function focusResult(target: HTMLElement | null | undefined) {
  if (!target) return
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  const navigationOffset =
    sidebar && window.getComputedStyle(sidebar).position === 'sticky'
      ? sidebar.getBoundingClientRect().height
      : 0
  target.style.scrollMarginTop = `${Math.ceil(navigationOffset) + 24}px`
  const focusTarget = target.querySelector<HTMLButtonElement>('.check-summary') ?? target
  focusTarget.focus({ preventScroll: true })
  target.scrollIntoView({
    behavior:
      document.documentElement.dataset.reduceMotion === 'true' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    block: 'start',
  })
}
