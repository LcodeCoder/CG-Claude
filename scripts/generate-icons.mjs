import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'

// Keep all desktop assets derived from the same editable vector mark.
const svg = await readFile(new URL('../public/logo.svg', import.meta.url))
const sizes = [16, 32, 64, 128, 256, 512, 1024]
const images = new Map(
  sizes.map((size) => [
    size,
    new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng(),
  ]),
)
await mkdir(new URL('../build/', import.meta.url), { recursive: true })
await writeFile(new URL('../build/icon.png', import.meta.url), images.get(1024))
await writeFile(new URL('../build/icon.svg', import.meta.url), svg)
await writeFile(new URL('../public/favicon.svg', import.meta.url), svg)

// icp6 is a 48px representation; putting a 64px PNG there corrupts small macOS icons.
// Include explicit Retina representations so app switcher / Dock use the correct size.
const icnsRepresentations = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]
const icnsChunks = icnsRepresentations.map(([type, size]) => {
  const png = images.get(size)
  const header = Buffer.alloc(8)
  header.write(type, 0, 'ascii')
  header.writeUInt32BE(png.length + 8, 4)
  return Buffer.concat([header, png])
})
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 'ascii')
icnsHeader.writeUInt32BE(8 + icnsChunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
await writeFile(
  new URL('../build/icon.icns', import.meta.url),
  Buffer.concat([icnsHeader, ...icnsChunks]),
)

function ico(images) {
  const sizes = [...images.keys()]
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  for (const [index, size] of sizes.entries()) {
    const png = images.get(size)
    const entry = 6 + index * 16
    header[entry] = size === 256 ? 0 : size
    header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  }
  return Buffer.concat([header, ...images.values()])
}
await writeFile(
  new URL('../build/icon.ico', import.meta.url),
  ico(new Map([...images].filter(([size]) => size <= 256))),
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
    new Resvg(coloredTray, { fitTo: { mode: 'width', value: size } }).render().asPng(),
  )
  if (size === 16 || size === 32) {
    // Transparent gaps stay transparent in both macOS menu bar appearances.
    const template = traySvg.replaceAll('stroke="#FFFFFF"', 'stroke="none"')
    await writeFile(
      new URL(size === 16 ? 'trayTemplate.png' : 'trayTemplate@2x.png', trayRoot),
      new Resvg(template, { fitTo: { mode: 'width', value: size } }).render().asPng(),
    )
  }
}
await writeFile(new URL('tray.png', trayRoot), trayImages.get(32))
await writeFile(new URL('tray@2x.png', trayRoot), trayImages.get(64))
await writeFile(new URL('tray.ico', trayRoot), ico(trayImages))
console.log('CG Claude desktop and tray icons generated')
