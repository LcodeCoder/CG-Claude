import { readFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import { expect, test } from 'vitest'

async function iconChunks() {
  const data = await readFile(new URL('../build/icon.icns', import.meta.url))
  expect(data.toString('ascii', 0, 4)).toBe('icns')
  expect(data.readUInt32BE(4)).toBe(data.length)
  const chunks = new Map<string, Buffer>()
  let offset = 8
  while (offset < data.length) {
    const type = data.toString('ascii', offset, offset + 4)
    const length = data.readUInt32BE(offset + 4)
    expect(length).toBeGreaterThan(8)
    expect(offset + length).toBeLessThanOrEqual(data.length)
    expect(chunks.has(type)).toBe(false)
    chunks.set(type, data.subarray(offset + 8, offset + length))
    offset += length
  }
  expect(offset).toBe(data.length)
  return chunks
}

// Decode both ICNS packet types so validation does not depend on the encoder's packet choices.
function decodeRgb(data: Buffer) {
  const values: number[] = []
  for (let offset = 0; offset < data.length;) {
    const control = data[offset++]!
    const length = control < 128 ? control + 1 : control - 125
    if (control < 128) {
      values.push(...data.subarray(offset, offset + length))
      offset += length
    } else values.push(...Array<number>(length).fill(data[offset++]!))
  }
  return values
}

test('small app icons preserve RGB channels and transparency in bundle-compatible slots', async () => {
  const svg = await readFile(new URL('../build/icon-mac.svg', import.meta.url))
  const chunks = await iconChunks()
  // Keep small representations in the explicit RGB and alpha-mask slots.
  expect(chunks.has('icp4')).toBe(false)
  expect(chunks.has('icp5')).toBe(false)
  expect(chunks.has('icp6')).toBe(false)
  for (const [size, rgbType, maskType] of [
    [16, 'is32', 's8mk'],
    [32, 'il32', 'l8mk'],
  ] as const) {
    const pixels = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().pixels
    const channels = decodeRgb(chunks.get(rgbType)!)
    const mask = chunks.get(maskType)!
    const count = size * size
    expect(channels).toHaveLength(count * 3)
    expect(mask).toHaveLength(count)
    const expectedRgb = Buffer.alloc(count * 3)
    const expectedMask = Buffer.alloc(count)
    for (let index = 0; index < count; index++) {
      expectedMask[index] = pixels[index * 4 + 3]!
      for (const channel of [0, 1, 2])
        expectedRgb[channel * count + index] = pixels[index * 4 + channel]!
    }
    // Compare every byte without creating thousands of individual assertions on slower runners.
    expect(Buffer.from(channels)).toEqual(expectedRgb)
    expect(mask).toEqual(expectedMask)
  }
})

test('large and Retina slots contain PNGs at their declared resolution', async () => {
  const chunks = await iconChunks()
  for (const [type, size] of [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ] as const) {
    const png = chunks.get(type)!
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size])
  }
})

test('the macOS icon body leaves balanced space around the Dock artwork', async () => {
  const svg = await readFile(new URL('../build/icon-mac.svg', import.meta.url))
  const { pixels, width, height } = new Resvg(svg).render()
  const row = Math.floor(height / 2)
  const opaque = Array.from({ length: width }, (_, x) => x).filter(
    (x) => pixels[(row * width + x) * 4 + 3]! >= 128,
  )
  expect(width).toBe(1024)
  expect(height).toBe(1024)
  expect(opaque.length).toBeGreaterThanOrEqual(820)
  expect(opaque.length).toBeLessThanOrEqual(832)
  expect(Math.abs(opaque[0]! - (width - 1 - opaque.at(-1)!))).toBeLessThanOrEqual(1)
})
