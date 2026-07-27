// ─── Transporte hacia impresoras Zebra desde el browser ─────────────────────────
//
// Una web app NO puede ejecutar `lp` ni abrir un socket TCP:9100 a la impresora
// local. El puente estándar de Zebra es "Zebra Browser Print": un servicio chico
// que el comercio instala una vez y que expone una HTTP API en localhost. El JS
// le manda ZPL raw y el servicio lo pasa a la impresora (USB o red).
//
//   GET  http://localhost:9100/default?type=printer   → impresora por defecto
//   GET  http://localhost:9100/available              → todas las impresoras
//   POST http://localhost:9100/write { device, data } → imprime ZPL raw
//
// Notas:
//  • En páginas https (stockos.digital) el fetch va a http://localhost:9100.
//    Chrome/Edge/Firefox tratan http://localhost como "seguro" y NO lo bloquean
//    por mixed-content, así que funciona. (Browser Print también expone 9101 https
//    con cert self-signed como alternativa.)
//  • Si Browser Print no está instalado/corriendo, detectDevice() devuelve null y
//    el caller cae al fallback de descargar el .zpl (probable con `lp -o raw`).

const BASE = 'http://localhost:9100'
const REQ_TIMEOUT_MS = 4000

export interface ZebraDevice {
  name: string
  uid: string
  connection: string
  deviceType: string
  version?: number
  provider?: string
  manufacturer?: string
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

/** ¿Está corriendo Zebra Browser Print en esta máquina? */
export async function isBrowserPrintAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/available`, { signal: withTimeout(REQ_TIMEOUT_MS) })
    return res.ok
  } catch {
    return false
  }
}

/** Impresora Zebra por defecto configurada en Browser Print (o null si no hay). */
export async function detectDevice(): Promise<ZebraDevice | null> {
  try {
    const res = await fetch(`${BASE}/default?type=printer`, { signal: withTimeout(REQ_TIMEOUT_MS) })
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    // Browser Print a veces devuelve el device como JSON, a veces como texto plano.
    try {
      return JSON.parse(text) as ZebraDevice
    } catch {
      return null
    }
  } catch {
    return null
  }
}

/** Lista de impresoras Zebra disponibles. */
export async function listDevices(): Promise<ZebraDevice[]> {
  try {
    const res = await fetch(`${BASE}/available`, { signal: withTimeout(REQ_TIMEOUT_MS) })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.printer ?? []) as ZebraDevice[]
  } catch {
    return []
  }
}

export class ZebraNotAvailableError extends Error {
  constructor() {
    super('Zebra Browser Print no está disponible en esta terminal')
    this.name = 'ZebraNotAvailableError'
  }
}

/**
 * Envía ZPL raw a la impresora. Si no se pasa `device`, usa la por defecto.
 * Lanza ZebraNotAvailableError si Browser Print no está corriendo → el caller
 * puede ofrecer el fallback de descarga.
 */
export async function sendZpl(zpl: string, device?: ZebraDevice | null): Promise<void> {
  const target = device ?? (await detectDevice())
  if (!target) throw new ZebraNotAvailableError()

  const res = await fetch(`${BASE}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device: target, data: zpl }),
    signal: withTimeout(REQ_TIMEOUT_MS + 4000),
  })
  if (!res.ok) throw new Error(`Browser Print respondió ${res.status}`)
}

/**
 * Fallback: descarga el ZPL como archivo. Sirve para probar sin Browser Print
 * (ej. `lp -d Zebra... -o raw archivo.zpl`) o para diagnósticos.
 */
export function downloadZpl(zpl: string, filename = 'etiquetas.zpl'): void {
  const blob = new Blob([zpl], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
