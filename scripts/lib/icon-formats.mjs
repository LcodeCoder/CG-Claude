// Use masked planar RGB for small ICNS slots and PNGs for large and Retina slots.
const pngSlots = [
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]

function icnsChunk(type, data) {
  const header = Buffer.alloc(8)
  header.write(type, 0, 'ascii')
  header.writeUInt32BE(data.length + 8, 4)
  return Buffer.concat([header, data])
}

function legacyRgb(pixels) {
  const packets = []
  // ICNS RGB stores each channel separately. Literal packets contain up to 128 bytes.
  for (const channel of [0, 1, 2]) {
    for (let start = 0; start < pixels.length / 4; start += 128) {
      const count = Math.min(128, pixels.length / 4 - start)
      const packet = Buffer.alloc(count + 1)
      packet[0] = count - 1
      for (let index = 0; index < count; index++)
        packet[index + 1] = pixels[(start + index) * 4 + channel]
      packets.push(packet)
    }
  }
  return Buffer.concat(packets)
}

export function encodeIcns(images) {
  const chunks = []
  for (const [size, rgbType, maskType] of [
    [16, 'is32', 's8mk'],
    [32, 'il32', 'l8mk'],
  ]) {
    const { pixels } = images.get(size)
    const mask = Buffer.from(
      Array.from({ length: size * size }, (_, index) => pixels[index * 4 + 3]),
    )
    chunks.push(icnsChunk(rgbType, legacyRgb(pixels)), icnsChunk(maskType, mask))
  }
  for (const [type, size] of pngSlots) chunks.push(icnsChunk(type, images.get(size).asPng()))
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

export function encodeIco(images) {
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
