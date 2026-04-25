import QRCode from 'qrcode'

export interface PrintInvoiceData {
  invoice_type: string
  numero: number
  fecha: string
  sale_id?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition: string
  net_amount: number
  iva_amount: number
  total_amount: number
  afip_cae?: string
  afip_cae_vto?: string
  notes?: string
  invoice_items: { description: string; quantity: number; unit_price: number; iva_rate?: number; subtotal: number }[]
  branches?: { name: string }
  registers?: { name: string }
  users?: { full_name: string }
  customers?: { full_name: string; document?: string }
  sales?: { payment_method: string }
}

export interface PrintBizData {
  name?: string | null
  cuit?: string | null
  address?: string | null
  phone?: string | null
  iva_condition?: string | null
  afip_punto_venta?: number | null
}

const TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
  NCA: 'NC A', NCB: 'NC B', NCC: 'NC C',
  NDA: 'ND A', NDB: 'ND B', NDC: 'ND C',
}

const IVA_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto', MO: 'Monotributista', EX: 'Exento',
  CF: 'Consumidor Final', M: 'Monotributista',
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', qr: 'QR', cuenta_corriente: 'Cta. Cte.',
}

function buildAfipQrUrl(invoice: PrintInvoiceData, cuit: string, ptoVta: number): string {
  const tipoCmpMap: Record<string, number> = {
    A: 1, B: 6, C: 11, R: 91,
    NCA: 3, NCB: 8, NCC: 13,
    NDA: 2, NDB: 7, NDC: 12,
  }
  const cuitEmisor = Number(cuit.replace(/\D/g, ''))
  const cuitReceptor = invoice.receptor_cuit ? Number(invoice.receptor_cuit.replace(/\D/g, '')) : 0
  const payload = {
    ver: 1, fecha: invoice.fecha, cuit: cuitEmisor, ptoVta,
    tipoCmp: tipoCmpMap[invoice.invoice_type] ?? 1,
    nroCmp: invoice.numero, importe: invoice.total_amount,
    moneda: 'PES', ctz: 1,
    tipoDocRec: invoice.receptor_cuit ? 80 : 99,
    nroDocRec: cuitReceptor, tipoCodAut: 'E',
    codAut: Number(invoice.afip_cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}

export async function printFacturaA4(
  invoice: PrintInvoiceData,
  biz: PrintBizData | undefined,
  fallbackCustomerName?: string,
) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
  const typeLabel = TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type
  const letra = invoice.invoice_type.charAt(0)
  const ptoVenta = String(biz?.afip_punto_venta ?? 1).padStart(5, '0')
  const numero = String(invoice.numero).padStart(8, '0')
  const isA = invoice.invoice_type === 'A'
  const receptorName = invoice.receptor_name
    ?? invoice.customers?.full_name
    ?? fallbackCustomerName
    ?? 'Consumidor Final'
  const paymentLabel = invoice.sales?.payment_method
    ? (PAYMENT_LABELS[invoice.sales.payment_method] ?? invoice.sales.payment_method)
    : null

  const typeColors: Record<string, string> = {
    A: '#991B1B', B: '#1B3F7F', C: '#166534', R: '#374151',
    NCA: '#991B1B', NCB: '#1B3F7F', NCC: '#166534',
    NDA: '#7C2D12', NDB: '#1E3A8A', NDC: '#14532D',
  }
  const color = typeColors[invoice.invoice_type] ?? '#374151'

  let qrDataUrl = ''
  if (biz?.cuit && invoice.afip_cae) {
    try {
      const url = buildAfipQrUrl(invoice, biz.cuit, biz.afip_punto_venta ?? 1)
      qrDataUrl = await QRCode.toDataURL(url, { width: 180, margin: 2, errorCorrectionLevel: 'M' })
    } catch { /* omitir QR si falla */ }
  }

  const win = window.open('', '_blank', 'width=900,height=1200')
  if (!win) return

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${typeLabel} ${ptoVenta}-${numero}</title>
  <style>
    @page { size: A4; margin: 12mm 16mm; }
    @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

    .doc-header { display: flex; border: 2px solid #111; }
    .doc-header-left { flex: 1; padding: 14px 16px; border-right: 1px solid #ccc; }
    .doc-header-center { width: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 8px; background: #f8f8f8; border-right: 1px solid #ccc; }
    .doc-header-right { flex: 1; padding: 14px 16px; }

    .letter-box { width: 68px; height: 68px; border: 3px solid ${color}; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .letter { font-size: 48px; font-weight: 900; color: ${color}; line-height: 1; font-family: Arial Black, Arial; }
    .letter-sub { font-size: 8px; color: #666; text-align: center; margin-top: 5px; line-height: 1.4; }

    .biz-name { font-size: 17px; font-weight: 700; margin-bottom: 4px; color: #111; }
    .biz-detail { font-size: 10px; color: #444; line-height: 1.6; }

    .inv-type-label { font-size: 14px; font-weight: 700; color: ${color}; margin-bottom: 6px; text-transform: uppercase; }
    .inv-number { font-size: 13px; font-weight: 700; font-family: 'Courier New', monospace; }
    .inv-meta { font-size: 11px; line-height: 1.7; color: #333; }
    .inv-meta-gray { font-size: 10px; color: #777; }

    .parties { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #ddd; border-top: none; }
    .party { padding: 10px 16px; }
    .party:first-child { border-right: 1px solid #ddd; }
    .party-title { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
    .party-name { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
    .party-detail { font-size: 10px; color: #444; line-height: 1.65; }

    .items-section { margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: ${color}; color: #fff; }
    th { padding: 7px 9px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 0.03em; }
    th.r { text-align: right; }
    td { padding: 7px 9px; border-bottom: 1px solid #eee; font-size: 11px; vertical-align: top; }
    td.r { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
    tr:nth-child(even) td { background: #fafafa; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .totals-box { width: 290px; border: 1px solid #ddd; overflow: hidden; border-radius: 2px; }
    .t-line { display: flex; justify-content: space-between; padding: 5px 12px; font-size: 11px; border-bottom: 1px solid #eee; }
    .t-line.grand { background: ${color}; color: #fff; font-weight: 700; font-size: 14px; padding: 9px 12px; border-bottom: none; }
    .t-line .mono { font-family: 'Courier New', monospace; }

    .payment-note { text-align: right; font-size: 10px; color: #555; margin-top: 7px; }
    .notes-box { margin-top: 10px; padding: 8px 12px; border: 1px solid #e5e5e5; border-radius: 2px; font-size: 11px; color: #555; font-style: italic; }

    .afip-footer { margin-top: 24px; border: 2px solid #ccc; border-radius: 5px; padding: 14px 16px; display: flex; align-items: center; gap: 20px; }
    .afip-logo { flex-shrink: 0; }
    .afip-data { flex: 1; }
    .afip-data-title { font-size: 12px; font-weight: 700; color: #4A4A4A; margin-bottom: 5px; }
    .afip-data-line { font-size: 10px; color: #333; line-height: 1.8; }
    .afip-data-line .mono { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; color: #111; }
    .afip-qr { flex-shrink: 0; text-align: center; }
    .afip-qr img { width: 100px; height: 100px; display: block; }
    .afip-qr-label { font-size: 8px; color: #888; margin-top: 3px; }

    .doc-footer { margin-top: 14px; text-align: center; font-size: 9px; color: #bbb; border-top: 1px solid #eee; padding-top: 8px; }
  </style>
</head>
<body>

  <!-- Encabezado -->
  <div class="doc-header">
    <div class="doc-header-left">
      <div class="biz-name">${biz?.name ?? ''}</div>
      <div class="biz-detail">
        ${biz?.cuit ? `CUIT: ${biz.cuit}<br>` : ''}
        ${biz?.address ? `${biz.address}<br>` : ''}
        ${biz?.phone ? `Tel: ${biz.phone}<br>` : ''}
        ${biz?.iva_condition ? `Cond. IVA: ${IVA_LABELS[biz.iva_condition] ?? biz.iva_condition}` : ''}
      </div>
    </div>
    <div class="doc-header-center">
      <div class="letter-box"><div class="letter">${letra}</div></div>
      <div class="letter-sub">Cód. ${ptoVenta}</div>
    </div>
    <div class="doc-header-right">
      <div class="inv-type-label">${typeLabel}</div>
      <div class="inv-number">N° ${ptoVenta}-${numero}</div>
      <div class="inv-meta" style="margin-top:5px;">
        <div>Fecha: ${invoice.fecha}</div>
        ${invoice.sale_id ? `<div class="inv-meta-gray">Ticket: #${invoice.sale_id.slice(-8).toUpperCase()}</div>` : ''}
        ${invoice.branches?.name ? `<div class="inv-meta-gray">Suc: ${invoice.branches.name}${invoice.registers?.name ? ` · ${invoice.registers.name}` : ''}</div>` : ''}
        ${invoice.users?.full_name ? `<div class="inv-meta-gray">Cajero: ${invoice.users.full_name}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- Emisor / Receptor -->
  <div class="parties">
    <div class="party">
      <div class="party-title">Emisor</div>
      <div class="party-name">${biz?.name ?? ''}</div>
      <div class="party-detail">
        ${biz?.cuit ? `CUIT: ${biz.cuit}<br>` : ''}
        ${biz?.address ? `${biz.address}<br>` : ''}
        ${biz?.iva_condition ? `Cond. IVA: ${IVA_LABELS[biz.iva_condition] ?? biz.iva_condition}` : ''}
      </div>
    </div>
    <div class="party">
      <div class="party-title">Receptor</div>
      <div class="party-name">${receptorName}</div>
      <div class="party-detail">
        ${invoice.receptor_cuit ? `CUIT: ${invoice.receptor_cuit}<br>` : invoice.customers?.document ? `Doc: ${invoice.customers.document}<br>` : ''}
        ${invoice.receptor_address ? `${invoice.receptor_address}<br>` : ''}
        Cond. IVA: ${IVA_LABELS[invoice.receptor_iva_condition] ?? invoice.receptor_iva_condition}
      </div>
    </div>
  </div>

  <!-- Items -->
  <div class="items-section">
    <table>
      <thead>
        <tr>
          <th style="width:44%">Descripción</th>
          <th class="r" style="width:9%">Cant.</th>
          <th class="r" style="width:18%">P. Unitario</th>
          ${isA ? `<th class="r" style="width:9%">IVA%</th><th class="r" style="width:20%">Subtotal</th>` : `<th class="r" style="width:29%">Subtotal</th>`}
        </tr>
      </thead>
      <tbody>
        ${invoice.invoice_items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td class="r">${item.quantity}</td>
            <td class="r">${fmt(item.unit_price)}</td>
            ${isA ? `<td class="r">${item.iva_rate ?? 21}%</td>` : ''}
            <td class="r">${fmt(item.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Totales -->
  <div class="totals-wrap">
    <div class="totals-box">
      ${isA ? `
        <div class="t-line"><span>Neto gravado</span><span class="mono">${fmt(invoice.net_amount)}</span></div>
        <div class="t-line"><span>IVA 21%</span><span class="mono">${fmt(invoice.iva_amount)}</span></div>
      ` : ''}
      <div class="t-line grand"><span>TOTAL</span><span class="mono">${fmt(invoice.total_amount)}</span></div>
    </div>
  </div>

  ${paymentLabel ? `<div class="payment-note">Método de pago: <strong>${paymentLabel}</strong></div>` : ''}
  ${invoice.notes ? `<div class="notes-box">Observaciones: ${invoice.notes}</div>` : ''}

  <!-- AFIP / ARCA -->
  ${invoice.afip_cae ? `
  <div class="afip-footer">
    <div class="afip-logo">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 68" width="150" height="51">
        <text x="100" y="44" text-anchor="middle" font-family="Arial Black,Arial" font-size="52" font-weight="900" fill="#4A4A4A">ARCA</text>
        <text x="100" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#666" letter-spacing="1.2">AGENCIA DE RECAUDACIÓN</text>
        <text x="100" y="68" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#666" letter-spacing="1.2">Y CONTROL ADUANERO</text>
      </svg>
    </div>
    <div class="afip-data">
      <div class="afip-data-title">Comprobante Autorizado por ARCA</div>
      <div class="afip-data-line">CAE: <span class="mono">${invoice.afip_cae}</span></div>
      ${invoice.afip_cae_vto ? `<div class="afip-data-line">Vencimiento CAE: <strong>${invoice.afip_cae_vto}</strong></div>` : ''}
      <div class="afip-data-line">Tipo: ${typeLabel} &nbsp;·&nbsp; N° ${ptoVenta}-${numero}</div>
    </div>
    ${qrDataUrl ? `
      <div class="afip-qr">
        <img src="${qrDataUrl}" alt="QR ARCA" />
        <div class="afip-qr-label">Escanear para<br>verificar</div>
      </div>
    ` : ''}
  </div>
  ` : ''}

  <div class="doc-footer">
    Generado por StockOS &nbsp;·&nbsp; ${new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>

</body>
</html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 600)
}
