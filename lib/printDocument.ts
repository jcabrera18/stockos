// Documento A4 con branding StockOS unificado.
//
// Todos los documentos "que salen a la calle" (remito, pedido de venta,
// presupuesto, remito de compra, remito de traslado, etc.) comparten este
// shell para mantener una marca consistente — mismo lenguaje visual que la
// factura A/B/C (lib/printFactura.ts), con el verde StockOS como color de marca.
//
// Cada caller arma su cuerpo (`bodyHtml`) usando las clases CSS que este shell
// expone (parties, table, totals-box, hl-box, sign, etc.) y delega header,
// footer, estilos y el disparo de impresión a `printDocument`.

export const DOC_BRAND = '#16a34a'        // --accent (verde StockOS)
export const DOC_BRAND_DARK = '#15803d'   // --accent-hover
export const DOC_BRAND_SUBTLE = '#dcfce7' // --accent-subtle

export interface DocBiz {
  name?: string | null
  cuit?: string | null
  address?: string | null
  phone?: string | null
  iva_condition?: string | null
}

export interface PrintDocumentOptions {
  /** Título de la pestaña/ventana */
  title: string
  /** Etiqueta grande del documento, ej. "REMITO", "Pedido de venta" */
  docLabel: string
  /** Letra fiscal opcional en recuadro (ej. "X" para remito de traslado) */
  letra?: string
  /** Línea de número, ej. "N° ABC123" */
  docNumber?: string
  /** Fecha / metadatos a la derecha, una línea por string */
  docMeta?: string[]
  biz?: DocBiz | null
  /** HTML del cuerpo, usando las clases del shell */
  bodyHtml: string
  /** Firmas al pie; cada string puede contener <br>. Si se omite, no se renderiza */
  signatures?: string[]
  /** Aclaración legal centrada bajo las firmas, ej. "Documento no válido como factura" */
  footerNote?: string
}

export const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(n) || 0)

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const IVA_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto', MO: 'Monotributista', EX: 'Exento',
  CF: 'Consumidor Final', M: 'Monotributista',
}

// ── Helpers para armar cuerpos consistentes ────────────────────────────────

export interface PartyBox {
  title: string
  name?: string
  /** Líneas de detalle ya formateadas (se escapan) */
  rows?: (string | false | null | undefined)[]
  /** HTML crudo extra al final del box (no se escapa) */
  rawHtml?: string
}

/** Grilla de 2 columnas con recuadros (emisor/receptor, cliente/estado, etc.) */
export function partiesGrid(boxes: PartyBox[]): string {
  return `<div class="parties">${boxes.map(b => `
    <div class="party">
      <div class="party-title">${esc(b.title)}</div>
      ${b.name ? `<div class="party-name">${esc(b.name)}</div>` : ''}
      ${(b.rows ?? []).filter(Boolean).length
        ? `<div class="party-detail">${(b.rows ?? []).filter(Boolean).map(r => esc(r)).join('<br>')}</div>`
        : ''}
      ${b.rawHtml ?? ''}
    </div>`).join('')}</div>`
}

/** Recuadro de totales alineado a la derecha. La última línea con grand:true va destacada. */
export function totalsBox(lines: { label: string; value: string; grand?: boolean }[]): string {
  return `<div class="totals-wrap"><div class="totals-box">${lines.map(l =>
    `<div class="t-line${l.grand ? ' grand' : ''}"><span>${esc(l.label)}</span><span class="mono">${esc(l.value)}</span></div>`
  ).join('')}</div></div>`
}

/** Caja destacada (saldo pendiente, validez, etc.) */
export function highlightBox(opts: {
  tone?: 'warn' | 'info' | 'success'
  label: string
  amount?: string
}): string {
  const tone = opts.tone ?? 'warn'
  return `<div class="hl-box hl-${tone}">
    <span>${esc(opts.label)}</span>
    ${opts.amount ? `<span class="hl-amt">${esc(opts.amount)}</span>` : ''}
  </div>`
}

export function bizDetailLines(biz?: DocBiz | null): string[] {
  if (!biz) return []
  return [
    biz.cuit ? `CUIT: ${biz.cuit}` : '',
    biz.address ?? '',
    biz.phone ? `Tel: ${biz.phone}` : '',
    biz.iva_condition ? `Cond. IVA: ${IVA_LABELS[biz.iva_condition] ?? biz.iva_condition}` : '',
  ].filter(Boolean) as string[]
}

// ── Shell + disparo de impresión ────────────────────────────────────────────

export function printDocument(opts: PrintDocumentOptions): void {
  const win = window.open('', '_blank', 'width=820,height=1040')
  if (!win) return

  const bizLines = bizDetailLines(opts.biz)
  const sigCols = opts.signatures?.length ?? 0

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(opts.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 13mm 15mm; }
    @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } button { display: none; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

    .doc-accent { height: 5px; background: ${DOC_BRAND}; border-radius: 3px; margin-bottom: 14px; }

    .doc-header { display: flex; justify-content: space-between; align-items: flex-start;
      padding-bottom: 12px; border-bottom: 2.5px solid ${DOC_BRAND}; }
    .biz-name { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; color: #111; }
    .biz-detail { font-size: 10.5px; color: #555; line-height: 1.7; margin-top: 4px; }
    .doc-box { text-align: right; }
    .doc-label { font-size: 21px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; color: ${DOC_BRAND}; }
    .doc-letra { display: inline-block; border: 2px solid ${DOC_BRAND}; color: ${DOC_BRAND};
      border-radius: 4px; padding: 0 9px; margin-left: 7px; font-size: 16px; vertical-align: middle; line-height: 1.4; }
    .doc-num { font-size: 12px; font-weight: 700; color: #222; margin-top: 6px; }
    .doc-meta { font-size: 10.5px; color: #666; line-height: 1.7; margin-top: 2px; }

    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
    .party { border: 1px solid #e2e2e2; border-radius: 6px; padding: 11px 14px; }
    .party-title { font-size: 9px; font-weight: 700; color: #9a9a9a; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
    .party-name { font-size: 13px; font-weight: 700; margin-bottom: 3px; color: #111; }
    .party-detail { font-size: 10.5px; color: #555; line-height: 1.65; }

    .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
      color: #9a9a9a; margin: 18px 0 7px; padding-bottom: 4px; border-bottom: 1px solid #ececec; }

    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    thead tr { background: ${DOC_BRAND}; color: #fff; }
    th { padding: 7px 10px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.03em; }
    th.r, td.r { text-align: right; }
    th.c, td.c { text-align: center; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
    td.r { font-variant-numeric: tabular-nums; white-space: nowrap; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .item-sub { font-size: 9.5px; color: #aaa; margin-top: 1px; }
    .qty-tag { color: ${DOC_BRAND_DARK}; font-weight: 700; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .totals-box { width: 300px; border: 1px solid #e2e2e2; border-radius: 4px; overflow: hidden; }
    .t-line { display: flex; justify-content: space-between; padding: 6px 13px; font-size: 12px; border-bottom: 1px solid #eee; }
    .t-line .mono { font-variant-numeric: tabular-nums; }
    .t-line.grand { background: ${DOC_BRAND}; color: #fff; font-weight: 700; font-size: 14px; padding: 9px 13px; border-bottom: none; }

    .hl-box { margin-top: 14px; padding: 11px 16px; border-radius: 6px; display: flex;
      justify-content: space-between; align-items: center; font-size: 13px; }
    .hl-warn { background: #fff8e1; border: 1px solid #f1c40f; color: #92610a; }
    .hl-warn .hl-amt { font-size: 19px; font-weight: 800; color: #b45309; }
    .hl-info { background: ${DOC_BRAND_SUBTLE}; border: 1px solid ${DOC_BRAND}; color: ${DOC_BRAND_DARK}; }
    .hl-info .hl-amt { font-size: 16px; font-weight: 700; }
    .hl-success { background: ${DOC_BRAND_SUBTLE}; border: 1px solid ${DOC_BRAND}; color: ${DOC_BRAND_DARK}; }

    .note-line { margin-top: 12px; font-size: 11px; color: #555; font-style: italic; }
    .meta-line { margin-top: 10px; font-size: 10.5px; color: #888; }
    .totals-bar { display: flex; justify-content: flex-end; gap: 22px; margin-top: 6px;
      padding: 6px 10px; background: #f5f5f5; border-radius: 4px; font-size: 10.5px; }
    .totals-bar .lbl { color: #777; }
    .totals-bar .val { font-weight: 700; color: #111; margin-left: 5px; }

    .signs { margin-top: 42px; display: grid; gap: 30px;
      grid-template-columns: repeat(${sigCols || 1}, 1fr); }
    .sign { border-top: 1px solid #bbb; padding-top: 7px; text-align: center; font-size: 10.5px; color: #666; line-height: 1.5; }

    .doc-footnote { margin-top: 18px; text-align: center; font-size: 10px; color: #999; }
    .doc-footer { margin-top: 22px; border-top: 1px solid #eee; padding-top: 9px; text-align: center; font-size: 9px; color: #c2c2c2; }
  </style>
</head>
<body>
  <div class="doc-accent"></div>

  <div class="doc-header">
    <div>
      <div class="biz-name">${esc(opts.biz?.name ?? '')}</div>
      ${bizLines.length ? `<div class="biz-detail">${bizLines.map(l => esc(l)).join('<br>')}</div>` : ''}
    </div>
    <div class="doc-box">
      <div class="doc-label">${esc(opts.docLabel)}${opts.letra ? `<span class="doc-letra">${esc(opts.letra)}</span>` : ''}</div>
      ${opts.docNumber ? `<div class="doc-num">${esc(opts.docNumber)}</div>` : ''}
      ${(opts.docMeta ?? []).length ? `<div class="doc-meta">${(opts.docMeta ?? []).map(m => esc(m)).join('<br>')}</div>` : ''}
    </div>
  </div>

  ${opts.bodyHtml}

  ${sigCols ? `<div class="signs">${opts.signatures!.map(s => `<div class="sign">${s}</div>`).join('')}</div>` : ''}
  ${opts.footerNote ? `<div class="doc-footnote">${esc(opts.footerNote)}</div>` : ''}

  <div class="doc-footer">
    Generado por StockOS &nbsp;·&nbsp; ${esc(opts.biz?.name ?? '')} &nbsp;·&nbsp; ${new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>
</body>
</html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 350)
}
