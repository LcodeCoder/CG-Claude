import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import { encodeIcns, encodeIco } from './lib/icon-formats.mjs'

// Keep all desktop assets derived from the same editable vector mark.
const svg = await readFile(new URL('../public/logo.svg', import.meta.url))
// Every mark uses vector paths, so scanning the host's installed fonts is unnecessary.
const font = { loadSystemFonts: false }
const sizes = [16, 32, 64, 128, 256, 512, 1024]
const images = new Map(
  sizes.map((size) => [
    size,
    new Resvg(svg, { font, fitTo: { mode: 'width', value: size } }).render().asPng(),
  ]),
)
await mkdir(new URL('../build/', import.meta.url), { recursive: true })
await writeFile(new URL('../build/icon.png', import.meta.url), images.get(1024))
await writeFile(new URL('../build/icon.svg', import.meta.url), svg)
await writeFile(new URL('../public/favicon.svg', import.meta.url), svg)

// macOS keeps extra transparent space around the icon body; the web logo keeps its own scale.
// The 880px inner canvas makes this mark's rounded background about 825px on a 1024px canvas.
const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
${svg.toString().replace('<svg ', '<svg x="72" y="72" width="880" height="880" ')}
</svg>`
const macImages = new Map(
  sizes.map((size) => [
    size,
    new Resvg(macSvg, { font, fitTo: { mode: 'width', value: size } }).render(),
  ]),
)
await writeFile(new URL('../build/icon-mac.png', import.meta.url), macImages.get(1024).asPng())
await writeFile(new URL('../build/icon-mac.svg', import.meta.url), macSvg)
await writeFile(new URL('../build/icon.icns', import.meta.url), encodeIcns(macImages))

// Keep the native iconset in sync for inspection and macOS iconutil compatibility checks.
const iconsetRoot = new URL('../build/icon.iconset/', import.meta.url)
await mkdir(iconsetRoot, { recursive: true })
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
    await writeFile(new URL(name, iconsetRoot), macImages.get(size * scale).asPng())
  }
}
await writeFile(
  new URL('../build/icon.ico', import.meta.url),
  encodeIco(new Map([...images].filter(([size]) => size <= 256))),
)

// The menu bar uses a transparent monochrome mark, with un-hashed Retina variants.
const trayRoot = new URL('../build/tray/', import.meta.url)
await mkdir(trayRoot, { recursive: true })
const traySvg = await readFile(new URL('../public/tray.svg', import.meta.url), 'utf8')
const coloredTray = traySvg.replaceAll('#000000', '#C45F3F')
const trayImages = new Map()
for (const size of [16, 32, 48, 64, 256]) {
  trayImages.set(
    size,
    new Resvg(coloredTray, { font, fitTo: { mode: 'width', value: size } }).render().asPng(),
  )
  if (size === 16 || size === 32) {
    // Transparent gaps stay transparent in both macOS menu bar appearances.
    const template = traySvg.replaceAll('stroke="#FFFFFF"', 'stroke="none"')
    await writeFile(
      new URL(size === 16 ? 'trayTemplate.png' : 'trayTemplate@2x.png', trayRoot),
      new Resvg(template, { font, fitTo: { mode: 'width', value: size } }).render().asPng(),
    )
  }
}
await writeFile(new URL('tray.png', trayRoot), trayImages.get(32))
await writeFile(new URL('tray@2x.png', trayRoot), trayImages.get(64))
await writeFile(new URL('tray.ico', trayRoot), encodeIco(trayImages))
console.log('CG Claude desktop and tray icons generated')
