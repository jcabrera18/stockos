import QRCode from 'qrcode'
import { getPaymentMethodLabel } from '@/lib/utils'
import { getPrintSettings, type PrintSettings } from '@/hooks/usePrintSettings'

// ──────────────────────────────────────────────────────────────────────────
// Módulo único de generación + impresión de tickets térmicos.
//
// Lo usan POS, Ventas y Comprobantes para que el ticket de venta y el de
// factura se vean IGUAL en todos lados, y para que ancho de papel (58/80mm),
// copias y tamaño de fuente (config por terminal) se apliquen siempre.
//
// Diseño canónico: el "premium" del POS (system-ui, separadores punteados).
// ──────────────────────────────────────────────────────────────────────────

export const IVA_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto', MO: 'Monotributista', EX: 'Exento',
  CF: 'Consumidor Final', M: 'Monotributista',
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
  NCA: 'Nota de Crédito A', NCB: 'Nota de Crédito B', NCC: 'Nota de Crédito C',
  NDA: 'Nota de Débito A', NDB: 'Nota de Débito B', NDC: 'Nota de Débito C',
}

export interface TicketBusiness {
  name?: string | null
  cuit?: string | null
  address?: string | null
  phone?: string | null
  iva_condition?: string | null
  afip_punto_venta?: number | null
}

export interface TicketSaleData {
  id: string
  created_at: string
  total: number
  discount?: number
  shipping_amount?: number
  payment_method: string
  installments?: number
  payment_splits?: Array<{ method: string; amount: number; installments?: number }>
  items: Array<{ name: string; quantity: number; unit_price: number; discount?: number }>
  branchName?: string
  registerName?: string
  sellerName?: string
  customerName?: string
}

export interface TicketInvoiceData {
  invoice_type: string
  numero?: number
  created_at?: string
  cae?: string
  cae_vto?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition?: string
  net_amount?: number
  iva_amount?: number
  total_amount?: number
  items: Array<{ description: string; quantity: number; unit_price: number; subtotal: number }>
  /** QR de ARCA ya generado (data URL). Usar buildInvoiceQrDataUrl(). */
  qrDataUrl?: string
  /** Datos de pago/forma para mostrar al pie (opcional) */
  payment_method?: string
  installments?: number
  payment_splits?: Array<{ method: string; amount: number; installments?: number }>
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // 24h: evita el "p. m." que se cortaba en dos líneas en la térmica.
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const SEP = `<hr style="border:none;border-top:1px dashed #555;margin:12px 0;width:100%;" />`

// Padding del contenido del ticket (los recibos traen el suyo en su wrapper).
// Lateral chico para aprovechar el ancho del papel térmico.
const wrap = (inner: string) => `<div style="padding:6px 6px 14px;">${inner}</div>`

// Bloques reutilizables ──────────────────────────────────────────────────
function bizHeader(biz: TicketBusiness): string {
  const cell = (label: string, value: string) => `
    <div>
      <div style="font-size:11px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.04em;">${esc(label)}</div>
      <div style="font-size:13px;font-weight:500;color:#000;line-height:1.25;">${esc(value)}</div>
    </div>`
  const cells = [
    biz.cuit ? cell('CUIT', biz.cuit) : '',
    biz.iva_condition ? cell('Cond. IVA', IVA_LABELS[biz.iva_condition] ?? biz.iva_condition) : '',
    biz.address ? cell('Domicilio', biz.address) : '',
    biz.phone ? cell('Teléfono', biz.phone) : '',
  ].filter(Boolean).join('')
  return `
    <div style="text-align:center;margin-bottom:4px;">
      <div style="font-size:17px;font-weight:400;letter-spacing:0.01em;color:#000;margin-bottom:8px;">${esc(biz.name ?? '')}</div>
      ${cells ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:8px;text-align:left;">${cells}</div>` : ''}
    </div>`
}

function metaRow(label: string, value: string, opts: { mono?: boolean; strong?: boolean } = {}): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:3px;">
      <span style="font-size:11px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.03em;flex-shrink:0;white-space:nowrap;">${esc(label)}</span>
      <span style="flex:1;text-align:right;word-break:break-word;font-size:13px;font-weight:${opts.strong ? 700 : 500};color:#000;${opts.mono ? 'font-family:monospace;' : ''}">${value}</span>
    </div>`
}

function paymentBlock(d: { payment_method?: string; installments?: number; payment_splits?: Array<{ method: string; amount: number; installments?: number }> }): string {
  if (!d.payment_method && !(d.payment_splits && d.payment_splits.length)) return ''
  if (d.payment_splits && d.payment_splits.length > 1) {
    return `<div style="margin-top:8px;font-size:11px;color:#333;line-height:1.8;">${d.payment_splits.map(s =>
      `<div style="display:flex;justify-content:space-between;"><span>${esc(getPaymentMethodLabel(s.method))}</span><span style="font-weight:500;">${fmt(s.amount)}${s.method === 'credito' && (s.installments ?? 1) > 1 ? ` (${s.installments} ctas)` : ''}</span></div>`
    ).join('')}</div>`
  }
  return `<div style="margin-top:8px;font-size:11px;color:#333;"><span style="font-weight:500;">${esc(getPaymentMethodLabel(d.payment_method!))}${d.payment_method === 'credito' && (d.installments ?? 1) > 1 ? ` · ${d.installments} cuotas` : ''}</span></div>`
}

const footer = `
  ${SEP}
  <div style="text-align:center;line-height:1.8;">
    <div style="font-size:13px;font-weight:600;color:#000;">¡Gracias por su compra!</div>
    <div style="font-size:10px;color:#888;margin-top:2px;letter-spacing:0.05em;">stockos.digital</div>
  </div>`

// ── Ticket de venta (canónico) ───────────────────────────────────────────
export function buildSaleTicketHtml(sale: TicketSaleData, biz: TicketBusiness): string {
  const itemsSubtotal = sale.items.reduce((a, i) => a + i.unit_price * i.quantity - (i.discount ?? 0), 0)
  const hasAdjustments = (sale.discount ?? 0) > 0 || (sale.shipping_amount ?? 0) > 0

  const meta = [
    (sale.branchName || sale.registerName)
      ? metaRow('Sucursal', esc(`${sale.branchName ?? ''}${sale.registerName ? ` · ${sale.registerName}` : ''}`)) : '',
    sale.sellerName ? metaRow('Cajero', esc(sale.sellerName)) : '',
    metaRow('Fecha', esc(fmtDateTime(sale.created_at))),
    metaRow('Ticket', `#${esc(sale.id.slice(-8).toUpperCase())}`, { mono: true, strong: true }),
    sale.customerName ? metaRow('Cliente', esc(sale.customerName)) : '',
  ].join('')

  const items = sale.items.map(item => {
    const lineTotal = item.unit_price * item.quantity - (item.discount ?? 0)
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <span style="flex:1;font-size:15px;font-weight:600;color:#000;line-height:1.2;">${esc(item.name)}</span>
          <span style="flex-shrink:0;font-size:15px;font-weight:700;color:#000;line-height:1.2;white-space:nowrap;">${fmt(lineTotal)}</span>
        </div>
        <div style="font-size:12px;font-weight:500;color:#000;margin-top:1px;">${item.quantity} × ${fmt(item.unit_price)}${(item.discount ?? 0) > 0 ? ` · dto -${fmt(item.discount!)}` : ''}</div>
      </div>`
  }).join('')

  return wrap(`
    ${bizHeader(biz)}
    ${SEP}
    <div style="line-height:1.4;">${meta}</div>
    ${SEP}
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;">Producto</span>
      <span style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;">Total</span>
    </div>
    ${items}
    ${SEP}
    ${hasAdjustments ? `
      <div style="font-size:11px;line-height:1.9;margin-bottom:6px;color:#333;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmt(itemsSubtotal)}</span></div>
        ${(sale.discount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Descuento</span><span>-${fmt(sale.discount!)}</span></div>` : ''}
        ${(sale.shipping_amount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Envío</span><span>+${fmt(sale.shipping_amount!)}</span></div>` : ''}
      </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding-top:2px;">
      <span style="font-size:14px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0;">Total</span>
      <span style="font-size:24px;font-weight:800;color:#000;letter-spacing:-0.02em;white-space:nowrap;">${fmt(sale.total)}</span>
    </div>
    ${paymentBlock(sale)}
    ${SEP}
    <div style="text-align:center;font-size:10px;color:#666;letter-spacing:0.06em;padding:2px 0;">NO VÁLIDO COMO FACTURA</div>
    ${footer}`)
}

// ── Ticket de factura / comprobante (canónico) ───────────────────────────
export function buildInvoiceTicketHtml(inv: TicketInvoiceData, biz: TicketBusiness): string {
  const typeLabel = INVOICE_TYPE_LABELS[inv.invoice_type] ?? `Comprobante ${inv.invoice_type}`
  const ptoVenta = String(biz.afip_punto_venta ?? 1).padStart(5, '0')
  const numero = String(inv.numero ?? 0).padStart(8, '0')
  const isA = inv.invoice_type === 'A'

  const rcell = (label: string, value: string) =>
    `<div><div style="font-size:11px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.04em;">${esc(label)}</div><div style="font-size:13px;font-weight:500;color:#000;line-height:1.25;">${esc(value)}</div></div>`
  const receptorCells = [
    rcell('Receptor', inv.receptor_name ?? 'Consumidor Final'),
    rcell('Cond. IVA', IVA_LABELS[inv.receptor_iva_condition ?? 'CF'] ?? inv.receptor_iva_condition ?? 'CF'),
    inv.receptor_cuit ? rcell('CUIT', inv.receptor_cuit) : '',
    inv.receptor_address ? rcell('Domicilio', inv.receptor_address) : '',
  ].join('')

  const items = inv.items.map(item => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <span style="flex:1;font-size:14px;font-weight:500;color:#000;line-height:1.2;">${esc(item.description)}</span>
        <span style="flex-shrink:0;font-size:14px;font-weight:700;color:#000;line-height:1.2;white-space:nowrap;">${fmt(item.subtotal)}</span>
      </div>
      <div style="font-size:12px;font-weight:500;color:#000;margin-top:1px;">${item.quantity} × ${fmt(item.unit_price)}</div>
    </div>`).join('')

  const caeBlock = inv.cae ? `
    <div style="text-align:center;">
      <div style="font-size:9px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.1em;">Comprobante autorizado por ARCA</div>
      <div style="font-size:11px;color:#000;margin-top:6px;">CAE: <span style="font-weight:700;font-family:monospace;font-size:10px;">${esc(inv.cae)}</span></div>
      ${inv.cae_vto ? `<div style="font-size:11px;color:#333;">Vto.: ${esc(inv.cae_vto)}</div>` : ''}
      ${inv.qrDataUrl ? `<img src="${inv.qrDataUrl}" style="width:110px;height:110px;display:block;margin:12px auto 4px;" alt="QR ARCA" />` : ''}
      <div style="font-size:9px;color:#888;margin-bottom:8px;">Verificar en afip.gob.ar/fe/qr</div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 58" width="90" height="31" style="display:block;margin:0 auto;">
        <text x="85" y="38" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="#000">ARCA</text>
        <text x="85" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#000" letter-spacing="1">AGENCIA DE RECAUDACION</text>
        <text x="85" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#000" letter-spacing="1">Y CONTROL ADUANERO</text>
      </svg>
    </div>` : `
    <div style="text-align:center;font-size:10px;color:#666;letter-spacing:0.06em;padding:2px 0;">NO VÁLIDO COMO FACTURA</div>`

  return wrap(`
    ${bizHeader(biz)}
    ${SEP}
    <div style="text-align:center;padding:4px 0;">
      <div style="font-size:16px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#000;">${esc(typeLabel)}</div>
      <div style="font-size:12px;font-weight:600;color:#333;margin-top:3px;font-family:monospace;">N° ${ptoVenta}-${numero}</div>
      ${inv.created_at ? `<div style="font-size:10px;color:#666;margin-top:3px;">${esc(fmtDateTime(inv.created_at))}</div>` : ''}
    </div>
    ${SEP}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;">${receptorCells}</div>
    ${SEP}
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;">Descripción</span>
      <span style="font-size:10px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;">Importe</span>
    </div>
    ${items}
    ${SEP}
    ${isA ? `
      <div style="font-size:11px;line-height:1.9;margin-bottom:6px;color:#333;">
        <div style="display:flex;justify-content:space-between;"><span>Neto gravado</span><span>${fmt(inv.net_amount ?? 0)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>IVA 21%</span><span>${fmt(inv.iva_amount ?? 0)}</span></div>
      </div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding-top:2px;">
      <span style="font-size:12px;font-weight:700;color:#000;text-transform:uppercase;letter-spacing:0.06em;flex-shrink:0;">Total</span>
      <span style="font-size:22px;font-weight:800;color:#000;letter-spacing:-0.02em;white-space:nowrap;">${fmt(inv.total_amount ?? 0)}</span>
    </div>
    ${paymentBlock(inv)}
    ${SEP}
    ${caeBlock}
    ${footer}`)
}

// ── QR de ARCA ────────────────────────────────────────────────────────────
const QR_TIPO_CMP: Record<string, number> = {
  A: 1, B: 6, C: 11, R: 91, NCA: 3, NCB: 8, NCC: 13, NDA: 2, NDB: 7, NDC: 12,
}

export function buildAfipQrUrl(
  inv: { invoice_type: string; numero?: number; total_amount?: number; receptor_cuit?: string; cae?: string; fecha?: string },
  cuit: string,
  ptoVta: number,
): string {
  const payload = {
    ver: 1,
    fecha: inv.fecha ?? new Date().toISOString().slice(0, 10),
    cuit: Number(cuit.replace(/\D/g, '')),
    ptoVta,
    tipoCmp: QR_TIPO_CMP[inv.invoice_type] ?? 1,
    nroCmp: inv.numero ?? 0,
    importe: inv.total_amount ?? 0,
    moneda: 'PES', ctz: 1,
    tipoDocRec: inv.receptor_cuit ? 80 : 99,
    nroDocRec: inv.receptor_cuit ? Number(inv.receptor_cuit.replace(/\D/g, '')) : 0,
    tipoCodAut: 'E',
    codAut: Number(inv.cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}

/** Genera el data URL del QR de ARCA, o '' si falta CAE/CUIT o falla. */
export async function buildInvoiceQrDataUrl(
  inv: { invoice_type: string; numero?: number; total_amount?: number; receptor_cuit?: string; cae?: string; fecha?: string },
  biz: TicketBusiness,
): Promise<string> {
  if (!inv.cae || !biz.cuit) return ''
  try {
    const url = buildAfipQrUrl(inv, biz.cuit, biz.afip_punto_venta ?? 1)
    return await QRCode.toDataURL(url, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
  } catch {
    return ''
  }
}

// ── Motor de impresión térmica compartido ─────────────────────────────────
/**
 * Abre la ventana de impresión aplicando la config de la terminal:
 * ancho 58/80mm, copias y escala de fuente. `bodyHtml` es el contenido
 * generado por los builders (o el innerHTML de un recibo).
 *
 * Diseño resolución-independiente:
 *  - El `body` tiene un ancho FÍSICO fijo en mm (= ancho del rollo) con
 *    `@page margin:0`, así el contenido queda anclado al papel y el driver
 *    no lo "encoge para ajustar" (causa típica de texto diminuto/tenue en 80mm).
 *  - Todo el diseño de los builders está en px; acá se convierte a `rem` para
 *    que UN SOLO `font-size` raíz escale texto + espaciado + QR de forma
 *    uniforme (zoom real). Antes sólo se escalaba `font-size`, así que el
 *    espaciado quedaba fijo y la densidad se desordenaba.
 */
export function printThermal(title: string, bodyHtml: string, settings?: PrintSettings): void {
  const ps = settings ?? getPrintSettings()
  const widthMm = ps.paperWidth   // 58 | 80 — ancho físico del rollo

  // El driver de muchas impresoras térmicas NO respeta `@page size:80mm` y
  // renderiza una página más ancha (luego la "aplasta" sobre el rollo). Si el
  // diseño usa px/mm absolutos, el texto sale diminuto o el contenido queda a
  // un costado. La solución robusta es dimensionar TODO en `vw` (= % del ancho
  // de la página = del rollo físico): así el ticket siempre llena el papel y el
  // texto mantiene el mismo tamaño físico, sin importar la config del driver.
  //
  // Factor px→vw por ancho. El 58mm rinde una página más angosta respecto al
  // papel físico (corta a la derecha si es muy grande), así que usa un factor
  // un poco menor que el 80mm. Ambos quedan calibrados para llenar su papel
  // sin desbordar.
  const vwPerPx = (widthMm === 58 ? 0.30 : 0.345) * ps.fontScale
  const vwHtml = bodyHtml
    .replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${(Number(n) * vwPerPx).toFixed(3)}vw`)
    // Las térmicas son monocromáticas: el gris sale como puntitos dispersos
    // (casi invisible). Forzamos todo el texto a negro sólido.
    .replace(/#(?:222|333|444|555|666|777|888|999|aaa|bbb|ccc)\b/gi, '#000')

  const copies = ps.copies
  const pageBreak = `<div style="break-after:page;page-break-after:always;"></div>`
  const body = Array.from({ length: copies }, (_, i) =>
    i < copies - 1 ? `${vwHtml}${pageBreak}` : vwHtml
  ).join('')

  // El área IMPRIMIBLE de un rollo es menor que el ancho del papel: en 58mm el
  // cabezal cubre ~48mm (~83%) y en 80mm ~72-76mm (~92%). Como las filas usan
  // `justify-content:space-between`, los valores de la derecha (Total, fecha,
  // #ticket) se anclan al borde del contenido; si el contenido llena casi todo
  // el papel, esos valores caen en la zona muerta de la derecha y se cortan.
  // Por eso el padding lateral es más grande en 58mm: encoge el contenido hacia
  // adentro para que todo entre en la franja imprimible. (El fontScale no
  // resolvía esto: space-between fija el borde derecho sin importar la fuente.)
  const bodyPadding = widthMm === 58 ? '3vw 17vw 5vw 5vw' : '3vw 4vw 5vw'

  const win = window.open('', '_blank', 'width=350,height=800')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      @page { size: ${widthMm}mm auto; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html { background: #fff; }
      body {
        width: 100%;
        padding: ${bodyPadding};
        font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
        font-weight: 400; line-height: 1.5; color: #000;
        background: #fff;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      /* Separadores: hairline fijo, no escalan (deben verse crisp siempre). */
      hr { border: none !important; border-top: 0.3mm dashed #000 !important; margin: 2vw 0 !important; }
    </style>
  </head><body>${body}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}
