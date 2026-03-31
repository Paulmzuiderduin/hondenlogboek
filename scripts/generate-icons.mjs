import { writeFileSync } from 'fs'
import { deflateSync } from 'zlib'
import { resolve } from 'path'

const background = [246, 196, 83, 255]
const paw = [58, 36, 21, 255]

const crcTable = new Uint32Array(256).map((_, i) => {
  let c = i
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return c >>> 0
})

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const b of buffer) {
    c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type)
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length)
  const crcBuffer = Buffer.alloc(4)
  const crc = crc32(Buffer.concat([typeBuffer, data]))
  crcBuffer.writeUInt32BE(crc)
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

const drawCircle = (canvas, width, height, centerX, centerY, radius, color) => {
  const r2 = radius * radius
  const xStart = Math.max(0, Math.floor(centerX - radius))
  const xEnd = Math.min(width - 1, Math.ceil(centerX + radius))
  const yStart = Math.max(0, Math.floor(centerY - radius))
  const yEnd = Math.min(height - 1, Math.ceil(centerY + radius))

  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x <= xEnd; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= r2) {
        const idx = (y * width + x) * 4
        canvas[idx] = color[0]
        canvas[idx + 1] = color[1]
        canvas[idx + 2] = color[2]
        canvas[idx + 3] = color[3]
      }
    }
  }
}

const makePawIcon = (size) => {
  const canvas = new Uint8Array(size * size * 4)
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = background[0]
    canvas[i + 1] = background[1]
    canvas[i + 2] = background[2]
    canvas[i + 3] = background[3]
  }

  const centerX = size * 0.5
  drawCircle(canvas, size, size, centerX, size * 0.6, size * 0.2, paw)
  drawCircle(canvas, size, size, centerX - size * 0.18, size * 0.35, size * 0.09, paw)
  drawCircle(canvas, size, size, centerX + size * 0.18, size * 0.35, size * 0.09, paw)
  drawCircle(canvas, size, size, centerX - size * 0.07, size * 0.25, size * 0.08, paw)
  drawCircle(canvas, size, size, centerX + size * 0.07, size * 0.25, size * 0.08, paw)

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    const rowStart = y * stride
    const targetStart = y * (stride + 1) + 1
    raw.set(canvas.subarray(rowStart, rowStart + stride), targetStart)
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const idat = deflateSync(raw)
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = resolve('public')
const icon192 = makePawIcon(192)
const icon512 = makePawIcon(512)

writeFileSync(resolve(publicDir, 'icon-192.png'), icon192)
writeFileSync(resolve(publicDir, 'icon-512.png'), icon512)
writeFileSync(resolve(publicDir, 'apple-touch-icon.png'), icon192)

console.log('Icons generated.')
