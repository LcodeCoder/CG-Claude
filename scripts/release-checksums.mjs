import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

// Hash distributable files only; unpacked apps and builder metadata stay local.
const directory = resolve(process.argv[2] ?? 'release')
const entries = await readdir(directory, { withFileTypes: true })
const installers = entries
  .filter((entry) => entry.isFile() && /\.(dmg|exe|AppImage|deb|zip)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()

if (installers.length === 0) {
  throw new Error(`No installers found in ${directory}`)
}

const checksums = []
for (const filename of installers) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(directory, filename))) {
    hash.update(chunk)
  }
  checksums.push(`${hash.digest('hex')}  ${filename}`)
}

await writeFile(join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
console.log(`Wrote SHA256SUMS.txt for ${installers.length} installers.`)
