// ─── Generación de ZPL para etiquetas de precio (impresoras Zebra) ──────────────
//
// El ZPL es solo texto: se arma en el browser, sin backend. Este módulo NO
// imprime — devuelve el string ZPL. El envío a la impresora vive en lib/zebra.ts.
//
// El template por defecto replica el que ya probaste a mano en la ZD220 (203dpi):
//   ^PW232 ^LL160 ^LH20,10  → etiqueta ~29mm × 20mm
//   nombre ^A0N,20,20 · precio ^A0N,42,42 · barcode ^BCN,35 (Code128)

export interface ZebraLabelInput {
  name: string
  /** Precio ya formateado, ej. "$2.950". Se imprime tal cual. */
  price: string
  /** Código de barras. Si es vacío, no se imprime la barra. */
  barcode?: string
}

export interface ZplTemplate {
  /** Ancho de impresión en dots (203dpi → 8 dots/mm). Default 232 ≈ 29mm. */
  widthDots: number
  /** Alto de etiqueta en dots. Default 160 ≈ 20mm. */
  lengthDots: number
  /** Offset del origen (label home). Default 20,10. */
  homeX: number
  homeY: number
  /** Densidad de oscuridad 0-30 (opcional; ^MD). */
  darkness?: number
}

// Densidad de la ZD220 y la mayoría de las Zebra de escritorio: 203 dpi = 8
// dots por mm. Si algún día se soporta una 300dpi habría que parametrizar esto.
export const DOTS_PER_MM = 8

/**
 * Construye un template a partir del tamaño FÍSICO de la etiqueta en centímetros
 * (lo que el comercio mide con una regla). El layout se adapta solo al alto, así
 * que el mismo generador sirve para una etiqueta de 2×2cm o un cartel de 5×3cm.
 */
export function templateFromCm(widthCm: number, heightCm: number): ZplTemplate {
  // cm → mm (×10) → dots (×8). Piso defensivo para no generar un ZPL degenerado.
  const widthDots = Math.max(80, Math.round(widthCm * 10 * DOTS_PER_MM))
  const lengthDots = Math.max(80, Math.round(heightCm * 10 * DOTS_PER_MM))
  return { widthDots, lengthDots, homeX: 0, homeY: 0 }
}

/** Tamaño en cm que representa un template (para mostrarlo en la UI). */
export function templateSizeCm(tpl: ZplTemplate): { widthCm: number; heightCm: number } {
  return {
    widthCm: +(tpl.widthDots / DOTS_PER_MM / 10).toFixed(1),
    heightCm: +(tpl.lengthDots / DOTS_PER_MM / 10).toFixed(1),
  }
}

// 2.9cm × 2.2cm — la etiqueta que ya se probó a mano en la ZD220.
export const DEFAULT_TEMPLATE: ZplTemplate = templateFromCm(2.9, 2.2)

// Zona muda (quiet zone) a cada lado del barcode, en módulos. Sin este blanco el
// lector no reconoce el inicio/fin. 10 es lo recomendado; usamos algo menos para
// no forzar módulos demasiado finos, pero garantizando margen.
const QUIET_ZONE_MODULES = 8

/**
 * Sanea texto para un campo ^FD: los caracteres de control de ZPL (^ y ~) romperían
 * el flujo de comandos. Los reemplazamos por espacio. Sin acentos exóticos: la
 * ZD220 usa la tabla de caracteres por defecto (CP850-ish); mantenemos ASCII seguro.
 */
function zplText(s: string): string {
  return (s ?? '')
    .replace(/[\^~]/g, ' ')
    .trim()
}

/**
 * ¿El código es un EAN-13 válido? En ese caso usamos ^BE (EAN-13, más compacto y
 * estándar de retail); si no, ^BC (Code128, acepta cualquier alfanumérico).
 */
function isEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const d = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += d[i] * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === d[12]
}

/**
 * Cantidad de módulos (barras angostas equivalentes) que ocupa el símbolo.
 * EAN-13 = 95 módulos fijos. Code128 con dígitos usa subset C (2 dígitos por
 * símbolo); con texto, subset B (1 símbolo por carácter). Fórmula estándar:
 * 11 módulos por símbolo (start + datos + check) + 13 del stop.
 */
function barcodeModules(code: string): number {
  if (isEan13(code)) return 95
  const allDigits = /^\d+$/.test(code)
  const nSym = allDigits ? Math.ceil(code.length / 2) : code.length
  return 11 * (nSym + 2) + 13
}

// Módulo mínimo para que las barras sean legibles a 203dpi. Verificado a mano:
// módulo 1 (0,125mm) NO lo toma el lector aunque tenga quiet zone; módulo 2 sí.
const MIN_MODULE = 2

/**
 * Elige el ancho de módulo (^BY) más grande — nunca menor a MIN_MODULE — que
 * permita que el barcode + su zona muda entren en la etiqueta. Devuelve null si
 * el código no entra de forma ESCANEABLE (ej. Code128 de 13 dígitos en 29mm):
 * ahí conviene no imprimir una barra muerta y mostrar el número legible.
 */
function chooseBarcode(code: string, widthDots: number): { module: number; widthDots: number } | null {
  const mods = barcodeModules(code)
  for (const m of [3, 2]) {
    if ((mods + 2 * QUIET_ZONE_MODULES) * m <= widthDots) return { module: m, widthDots: mods * m }
  }
  return null // no entra grueso + con quiet zone → no sería escaneable
}

/** ¿El código se puede imprimir como barcode escaneable en esta etiqueta? */
export function isBarcodePrintable(code: string, tpl: ZplTemplate = DEFAULT_TEMPLATE): boolean {
  const clean = (code ?? '').replace(/[\^~\s]/g, '')
  return !!clean && chooseBarcode(clean, tpl.widthDots) !== null
}

// Ancho medio de un carácter de la fuente ^A0 ≈ este factor × la altura. Sirve
// para estimar cuánto ocupa un texto y decidir tamaño/centrado. Conservador para
// no desbordar.
const A0_CHAR_W = 0.62

// Margen de seguridad a cada lado (dots). El texto NUNCA debe llegar al borde:
// la esquina redondeada y el leve desalineado del papel se comen el 1er carácter.
const SAFE_MARGIN = 18

/**
 * Ajusta un texto a UNA línea dentro del ancho útil (widthDots − 2·margen): baja
 * la altura de fuente hasta que entre (entre maxH y minH). Si aún al mínimo no
 * entra y `truncate`, recorta; si no (precios), deja el mínimo. Devuelve altura,
 * texto y el x para centrarlo manualmente (sin ^FB, que encima el texto al
 * desbordar). Garantiza ≥ SAFE_MARGIN de blanco a cada lado.
 */
function fitLine(
  text: string,
  widthDots: number,
  maxH: number,
  minH: number,
  truncate: boolean,
): { h: number; x: number; text: string } {
  if (!text) return { h: minH, x: SAFE_MARGIN, text: '' }
  const usable = widthDots - 2 * SAFE_MARGIN
  let h = Math.min(maxH, Math.floor(usable / (text.length * A0_CHAR_W)))
  h = Math.max(minH, h)
  let t = text
  if (truncate) {
    const maxChars = Math.floor(usable / (A0_CHAR_W * h))
    if (t.length > maxChars) t = t.slice(0, Math.max(1, maxChars))
  }
  const textW = t.length * A0_CHAR_W * h
  const x = Math.max(SAFE_MARGIN, Math.round((widthDots - textW) / 2))
  return { h, x, text: t }
}

/** Genera el ZPL de UNA etiqueta (^XA ... ^XZ), con todo centrado horizontalmente. */
export function buildLabelZpl(input: ZebraLabelInput, tpl: ZplTemplate = DEFAULT_TEMPLATE): string {
  const name = zplText(input.name)
  const price = zplText(input.price)
  const code = (input.barcode ?? '').replace(/[\^~\s]/g, '')
  const w = tpl.widthDots
  const H = tpl.lengthDots

  // Layout vertical ADAPTATIVO: los elementos se reparten el alto de la etiqueta
  // en proporción, así el mismo generador rinde bien en 2×2cm o en 5×3cm sin
  // recortar texto ni dejar la mitad del papel en blanco. Todo se calcula sobre
  // `H` (alto real en dots) en vez de offsets fijos.
  const margin = Math.max(6, Math.round(H * 0.06)) // aire arriba y abajo
  const gap = Math.max(3, Math.round(H * 0.035))    // separación entre bloques
  const inner = H - 2 * margin

  // Techos de fuente proporcionales al alto; con barcode se deja lugar abajo.
  const nameMaxH = Math.max(12, Math.round(inner * (code ? 0.20 : 0.28)))
  const priceMaxH = Math.max(18, Math.round(inner * (code ? 0.42 : 0.58)))

  // Nombre: achica la fuente y recorta si es larguísimo (no debe pisar texto).
  const nf = fitLine(name, w, nameMaxH, Math.min(14, nameMaxH), true)
  // Precio: solo achica (nunca recorta un precio); centrado manual.
  const pf = fitLine(price, w, priceMaxH, Math.min(20, priceMaxH), false)

  const lines: string[] = ['^XA']
  if (tpl.darkness != null) lines.push(`^MD${tpl.darkness}`)
  lines.push(
    `^PW${tpl.widthDots}`,
    `^LL${tpl.lengthDots}`,
    `^LH${tpl.homeX},${tpl.homeY}`,
  )

  let y = margin
  // Nombre — 1 línea, centrado manual (sin ^FB para que nunca se encime)
  lines.push(`^FO${nf.x},${y}`, `^A0N,${nf.h},${nf.h}`, `^FD${nf.text}^FS`)
  y += nf.h + gap
  // Precio grande — centrado
  lines.push(`^FO${pf.x},${y}`, `^A0N,${pf.h},${pf.h}`, `^FD${pf.text}^FS`)
  y += pf.h + gap

  // Código de barras — módulo ≥2 con quiet zone, centrado, usando el alto que
  // sobra. Si no entra escaneable, imprime el número legible (mejor que una
  // barra muerta que confunde al cajero). Si no hay ni espacio, se omite.
  if (code) {
    const avail = H - y - margin
    if (avail >= 24) {
      const bc = chooseBarcode(code, w)
      if (bc) {
        const x = Math.max(0, Math.round((w - bc.widthDots) / 2))
        const bh = Math.max(24, Math.min(70, avail)) // más alto = escanea más fácil
        lines.push(`^FO${x},${y}`, `^BY${bc.module},2,${bh}`)
        if (isEan13(code)) {
          lines.push(`^BEN,${bh},N,N`, `^FD${code.slice(0, 12)}^FS`) // ^BE calcula el dígito 13
        } else {
          lines.push(`^BCN,${bh},N,N,N`, `^FD${code}^FS`)
        }
      } else {
        // Fallback: número centrado, para buscarlo/tipearlo en el POS
        const cf = fitLine(code, w, Math.min(24, avail), Math.min(14, avail), false)
        lines.push(`^FO${cf.x},${y}`, `^A0N,${cf.h},${cf.h}`, `^FD${cf.text}^FS`)
      }
    }
  }
  lines.push('^XZ')
  return lines.join('\n')
}

/**
 * Concatena varias etiquetas en un solo job ZPL. Se puede repetir cada una
 * `copies` veces (equivalente a ^PQ pero explícito y compatible con cualquier
 * firmware).
 */
export function buildBatchZpl(
  items: ZebraLabelInput[],
  tpl: ZplTemplate = DEFAULT_TEMPLATE,
  copies = 1,
): string {
  const out: string[] = []
  for (const item of items) {
    const zpl = buildLabelZpl(item, tpl)
    for (let i = 0; i < copies; i++) out.push(zpl)
  }
  return out.join('\n')
}
