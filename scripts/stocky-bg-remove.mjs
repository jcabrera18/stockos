// Quita el fondo sólido de un render de Stocky usando flood-fill desde los
// bordes (preserva los blancos/cremas INTERIORES: cabeza, zapatillas), recorta
// el sobrante transparente y optimiza a una altura razonable para la web.
//
//   node scripts/stocky-bg-remove.mjs <in> <out> [tolerance=20] [height=512]
import sharp from 'sharp'

const [, , inPath, outPath, tolArg, hArg] = process.argv
const TOL = Number(tolArg ?? 20)
const OUT_H = Number(hArg ?? 512)

const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info

// Color de fondo = promedio de las 4 esquinas
const corner = (x, y) => { const p = (y * W + x) * 4; return [data[p], data[p + 1], data[p + 2]] }
const corners = [corner(0, 0), corner(W - 1, 0), corner(0, H - 1), corner(W - 1, H - 1)]
const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((a, k) => a + k[c], 0) / corners.length))
const tol2 = TOL * TOL
const near = (p) => {
  const dr = data[p] - bg[0], dg = data[p + 1] - bg[1], db = data[p + 2] - bg[2]
  return dr * dr + dg * dg + db * db <= tol2
}

// Flood-fill iterativo desde todos los píxeles del borde
const visited = new Uint8Array(W * H)
const stack = []
for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x) }
for (let y = 0; y < H; y++) { stack.push(y * W, y * W + (W - 1)) }

let cleared = 0
while (stack.length) {
  const idx = stack.pop()
  if (visited[idx]) continue
  visited[idx] = 1
  const p = idx * 4
  if (!near(p)) continue          // límite del personaje → no propagar
  data[p + 3] = 0                 // fondo → transparente
  cleared++
  const x = idx % W, y = (idx / W) | 0
  if (x > 0) stack.push(idx - 1)
  if (x < W - 1) stack.push(idx + 1)
  if (y > 0) stack.push(idx - W)
  if (y < H - 1) stack.push(idx + W)
}

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .trim()                         // recorta el borde transparente
  .resize({ height: OUT_H, withoutEnlargement: true })
  .png({ compressionLevel: 9, quality: 90 })
  .toFile(outPath)

console.log(`bg=${bg} tol=${TOL} cleared=${cleared}px → ${outPath}`)
