'use client'
import { useRef, useState, useEffect } from 'react'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, Plus, X, CheckCircle, CreditCard, MessageCircle, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import html2canvas from 'html2canvas'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import QRCode from 'qrcode'

interface CartItem {
  product: { name: string; unit: string; barcode?: string }
  quantity: number
  unit_price: number
  discount: number
  applied_list?: string
  applied_margin?: number
}

interface TicketSale {
  id: string
  total: number
  subtotal: number
  discount: number
  shipping_amount?: number
  payment_method: string
  installments: number
  payment_splits?: Array<{ method: string; amount: number; installments?: number }>
  items: CartItem[]
  created_at: string
}

interface BusinessInfo {
  name: string
  cuit?: string | null
  address?: string | null
  phone?: string | null
  iva_condition?: string | null
  afip_punto_venta?: number | null
}

interface InvoiceInfo {
  id: string
  invoice_type: string
  numero?: number
  cae?: string
  afip_cae?: string
  cae_expiry?: string
  afip_cae_vto?: string
  afip_status: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition?: string
  net_amount?: number
  iva_amount?: number
  total_amount?: number
  invoice_items?: { id: string; description: string; quantity: number; unit_price: number; iva_rate?: number; subtotal: number }[]
}

interface POSTicketProps {
  open: boolean
  sale: TicketSale
  invoiceId?: string
  onNewSale: () => void
  onClose: () => void
  customerPhone?: string
  customerName?: string
  business?: BusinessInfo
  branchName?: string
  registerName?: string
  sellerName?: string
}

const IVA_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto', MO: 'Monotributista', EX: 'Exento',
  CF: 'Consumidor Final', M: 'Monotributista',
}

const TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
}

function buildAfipQrUrl(invoice: InvoiceInfo, cuit: string, ptoVta: number): string {
  const tipoCmpMap: Record<string, number> = {
    A: 1, B: 6, C: 11, R: 91,
    NCA: 3, NCB: 8, NCC: 13,
    NDA: 2, NDB: 7, NDC: 12,
  }
  const cuitEmisor = Number(cuit.replace(/\D/g, ''))
  const cuitReceptor = invoice.receptor_cuit ? Number(invoice.receptor_cuit.replace(/\D/g, '')) : 0
  const cae = invoice.afip_cae ?? invoice.cae
  const payload = {
    ver: 1, fecha: (invoice as { fecha?: string }).fecha ?? new Date().toISOString().slice(0, 10),
    cuit: cuitEmisor, ptoVta,
    tipoCmp: tipoCmpMap[invoice.invoice_type] ?? 1,
    nroCmp: invoice.numero ?? 0,
    importe: invoice.total_amount ?? 0,
    moneda: 'PES', ctz: 1,
    tipoDocRec: invoice.receptor_cuit ? 80 : 99,
    nroDocRec: cuitReceptor, tipoCodAut: 'E',
    codAut: Number(cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}

export function POSTicket({
  open, sale, invoiceId, onNewSale, onClose,
  customerPhone, customerName,
  business, branchName, registerName, sellerName,
}: POSTicketProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)

  // Convert modal state
  const [convertModal, setConvertModal] = useState(false)
  const [convertType, setConvertType] = useState<'A' | 'B' | 'C'>('B')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorName, setReceptorName] = useState('')
  const [receptorAddress, setReceptorAddress] = useState('')
  const [receptorIva, setReceptorIva] = useState('CF')
  const [converting, setConverting] = useState(false)

  const itemsSubtotal = sale.items.reduce(
    (a, i) => a + i.unit_price * i.quantity - i.discount, 0
  )

  useEffect(() => {
    if (!invoiceId) return
    api.get<InvoiceInfo>(`/api/invoices/${invoiceId}`)
      .then((inv) => { if (inv) setInvoice(inv) })
      .catch(() => {})
  }, [invoiceId])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || convertModal) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); handlePrint() }
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); handleShareWhatsApp() }
      if ((e.key === 'f' || e.key === 'F') && invoice?.invoice_type === 'X') {
        e.preventDefault(); openConvertModal()
      }
      if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
        e.preventDefault(); onNewSale()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, convertModal, invoice, sale]) // eslint-disable-line react-hooks/exhaustive-deps

  const isInvoiced = !!(invoice && invoice.afip_status === 'authorized' && (invoice.cae || invoice.afip_cae))

  const openConvertModal = () => {
    setConvertType('B')
    setReceptorName(invoice?.receptor_name ?? customerName ?? '')
    setReceptorCuit(invoice?.receptor_cuit ?? '')
    setReceptorAddress(invoice?.receptor_address ?? '')
    setReceptorIva(invoice?.receptor_iva_condition ?? 'CF')
    setConvertModal(true)
  }

  const handlePrintInvoiceTicket = async (inv: InvoiceInfo) => {
    const biz = business
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
    const typeLabel = TYPE_LABELS[inv.invoice_type] ?? inv.invoice_type
    const numero = String(inv.numero ?? 0).padStart(8, '0')
    const isA = inv.invoice_type === 'A'
    const ptoVenta = String(biz?.afip_punto_venta ?? 1).padStart(5, '0')
    const cae = inv.afip_cae ?? inv.cae

    let qrDataUrl = ''
    if (cae && biz?.cuit) {
      try {
        const url = buildAfipQrUrl(inv, biz.cuit, biz.afip_punto_venta ?? 1)
        qrDataUrl = await QRCode.toDataURL(url, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
      } catch { }
    }

    const sep = `<div style="border-top:1px dashed #999;margin:8px 0;"></div>`
    const row = (left: string, right: string) =>
      `<div style="display:flex;justify-content:space-between;">${left}${right}</div>`

    const html = `
      <div style="text-align:center;margin-bottom:2px;">
        <div style="font-size:15px;font-weight:bold;letter-spacing:0.04em;">${biz?.name ?? ''}</div>
        ${biz?.cuit ? `<div>CUIT: ${biz.cuit}</div>` : ''}
        ${biz?.address ? `<div style="font-size:11px;">${biz.address}</div>` : ''}
        ${biz?.phone ? `<div style="font-size:11px;">Tel: ${biz.phone}</div>` : ''}
        ${biz?.iva_condition ? `<div style="font-size:11px;">Cond. IVA: ${IVA_LABELS[biz.iva_condition] ?? biz.iva_condition}</div>` : ''}
      </div>
      ${sep}
      <div style="text-align:center;font-weight:bold;font-size:13px;">${typeLabel.toUpperCase()}</div>
      <div style="text-align:center;">N° ${ptoVenta}-${numero}</div>
      ${sep}
      <div><strong>Receptor:</strong> ${inv.receptor_name ?? customerName ?? 'Consumidor Final'}</div>
      ${inv.receptor_cuit ? `<div style="font-size:11px;">CUIT: ${inv.receptor_cuit}</div>` : ''}
      ${inv.receptor_address ? `<div style="font-size:11px;">${inv.receptor_address}</div>` : ''}
      <div style="font-size:11px;">Cond. IVA: ${IVA_LABELS[inv.receptor_iva_condition ?? 'CF'] ?? inv.receptor_iva_condition}</div>
      ${sep}
      ${row('<span style="font-weight:bold;font-size:11px;">DESCRIPCIÓN</span>', '<span style="font-weight:bold;font-size:11px;">IMPORTE</span>')}
      <div style="margin-top:4px;">
        ${(inv.invoice_items ?? []).map(item => `
          <div style="margin-bottom:6px;">
            ${row(
              `<span style="flex:1;padding-right:8px;word-break:break-word;">${item.quantity}x ${item.description}</span>`,
              `<span style="flex-shrink:0;">${fmt(item.subtotal)}</span>`
            )}
            <div style="font-size:11px;color:#333;font-weight:600;">  c/u ${fmt(item.unit_price)}</div>
          </div>
        `).join('')}
      </div>
      ${sep}
      ${isA ? `
        ${row('<span>Neto gravado</span>', `<span>${fmt(inv.net_amount ?? 0)}</span>`)}
        ${row('<span>IVA 21%</span>', `<span>${fmt(inv.iva_amount ?? 0)}</span>`)}
      ` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:2px;">
        <span>TOTAL</span><span>${fmt(inv.total_amount ?? 0)}</span>
      </div>
      ${sep}
      ${cae ? `
        <div style="text-align:center;font-weight:bold;font-size:11px;">COMPROBANTE AUTORIZADO</div>
        <div style="text-align:center;font-size:11px;">CAE: ${cae}</div>
        ${inv.afip_cae_vto ?? inv.cae_expiry ? `<div style="text-align:center;font-size:11px;">Vto. CAE: ${inv.afip_cae_vto ?? inv.cae_expiry}</div>` : ''}
        ${qrDataUrl ? `
          <div style="text-align:center;margin:6px 0;">
            <img src="${qrDataUrl}" style="width:100px;height:100px;" />
          </div>
          <div style="text-align:center;font-size:10px;color:#555;">Verificar en afip.gob.ar/fe/qr</div>
          <div style="text-align:center;margin:6px 0;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 58" width="110" height="38">
              <text x="85" y="38" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="#4A4A4A">ARCA</text>
              <text x="85" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#666" letter-spacing="1">AGENCIA DE RECAUDACIÓN</text>
              <text x="85" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#666" letter-spacing="1">Y CONTROL ADUANERO</text>
            </svg>
          </div>
        ` : ''}
      ` : `
        <div style="text-align:center;font-weight:bold;padding:2px 0;letter-spacing:0.03em;">*** NO VÁLIDO COMO FACTURA ***</div>
      `}
      ${sep}
      <div style="text-align:center;font-size:11px;line-height:1.6;">
        <div>¡Gracias por su compra!</div>
        <div style="color:#444;font-weight:700;">Powered by StockOS</div>
      </div>
    `

    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${typeLabel} ${ptoVenta}-${numero}</title>
      <style>
        @page { size: 80mm auto; margin: 0mm 2mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 80mm; background: #fff; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 500; line-height: 1.4; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style>
    </head><body><div style="padding:4px 10px 12px;">${html}</div></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleConvert = async () => {
    if (!invoice) return
    if (convertType === 'A' && !receptorCuit) {
      toast.error('El CUIT del receptor es obligatorio para Factura A')
      return
    }
    setConverting(true)
    try {
      const converted = await api.post<InvoiceInfo>('/api/invoices/convert', {
        invoice_id: invoice.id,
        invoice_type: convertType,
        receptor_cuit: receptorCuit || null,
        receptor_name: receptorName || null,
        receptor_address: receptorAddress || null,
        receptor_iva_condition: receptorIva,
      })
      setConvertModal(false)

      toast.loading('Autorizando en ARCA...', { id: 'afip-auth' })
      try {
        const authorized = await api.post<InvoiceInfo>(`/api/invoices/${converted.id}/authorize`, {})
        toast.success(`Factura ${convertType} autorizada — CAE: ${authorized.afip_cae ?? authorized.cae}`, { id: 'afip-auth' })
        const merged = { ...authorized, invoice_items: authorized.invoice_items ?? converted.invoice_items }
        setInvoice(merged)
        await handlePrintInvoiceTicket(merged)
      } catch (afipErr: unknown) {
        toast.error(afipErr instanceof Error ? afipErr.message : 'Error al autorizar en ARCA', { id: 'afip-auth' })
        setInvoice(converted)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    } finally { setConverting(false) }
  }

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket</title>
  <style>
    @page { size: 80mm auto; margin: 3mm 2mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 500; line-height: 1.4; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleShareWhatsApp = async () => {
    if (!printRef.current) return
    setSharing(true)
    try {
      const canvas = await html2canvas(printRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo generar la imagen')), 'image/png')
      )
      if (navigator.canShare?.({ files: [new File([blob], 'ticket.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([blob], `ticket-${sale.id.slice(-8)}.png`, { type: 'image/png' })],
          title: 'Comprobante de compra',
        })
        return
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      const phone = customerPhone?.replace(/\D/g, '')
      const url = phone ? `https://web.whatsapp.com/send?phone=${phone}` : 'https://web.whatsapp.com/'
      window.open(url, '_blank')
      toast.success('Imagen copiada — pegala en el chat con Ctrl+V', { duration: 6000 })
    } catch (err) {
      toast.error('No se pudo generar la imagen')
      console.error(err)
    } finally {
      setSharing(false)
    }
  }

  // Styles shared between screen and print
  const sep: React.CSSProperties = { borderTop: '1px dashed #999', margin: '8px 0' }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }

  const invoiceTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      A: 'FACTURA A', B: 'FACTURA B', C: 'FACTURA C',
      NCA: 'NOTA DE CRÉDITO A', NCB: 'NOTA DE CRÉDITO B', NCC: 'NOTA DE CRÉDITO C',
      R: 'REMITO',
    }
    return map[type] ?? `COMPROBANTE ${type}`
  }

  if (!open) return null

  return (
    <>
      {/* Overlay sobre el POS */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      >
        <div className="w-full max-w-sm flex flex-col gap-3" style={{ maxHeight: 'calc(100vh - 32px)' }}>

          {/* Header */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
              <CheckCircle size={20} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">Venta registrada</p>
              <p className="text-xs text-white/60">{formatDateTime(sale.created_at)}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-1.5 rounded-lg text-white/60 hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Botones de acción — siempre visibles arriba */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handlePrint}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-[var(--radius-md)] bg-white/10 border border-white/20 text-sm font-medium text-white hover:bg-white/20 transition-colors active:scale-95"
              >
                <Printer size={15} />
                <span>Imprimir</span>
                <kbd className="text-[10px] bg-white/10 border border-white/20 px-1.5 rounded font-sans leading-tight">P</kbd>
              </button>
              <button
                onClick={handleShareWhatsApp}
                disabled={sharing}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-[var(--radius-md)] bg-[#25d366] text-white text-sm font-medium hover:bg-[#20bd5a] transition-colors active:scale-95 disabled:opacity-60"
              >
                {sharing ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
                <span>WhatsApp</span>
                <kbd className="text-[10px] bg-white/20 border border-white/20 px-1.5 rounded font-sans leading-tight">W</kbd>
              </button>
              <button
                onClick={() => invoice?.invoice_type === 'X' ? openConvertModal() : undefined}
                disabled={!invoice || invoice.invoice_type !== 'X'}
                className="flex flex-col items-center justify-center gap-1 py-3 rounded-[var(--radius-md)] bg-white/10 border border-white/20 text-sm font-medium text-white hover:bg-white/20 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CreditCard size={15} />
                <span>Facturar</span>
                <kbd className="text-[10px] bg-white/10 border border-white/20 px-1.5 rounded font-sans leading-tight">F</kbd>
              </button>
            </div>
            <button
              onClick={onNewSale}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors active:scale-95"
            >
              <Plus size={15} />
              Nueva venta
              <kbd className="ml-1 text-[10px] bg-white/20 border border-white/20 px-1.5 py-0.5 rounded font-sans">Enter</kbd>
            </button>
          </div>

          {/* Ticket paper — scrolleable si hay muchos items */}
          <div className="overflow-y-auto" style={{ borderRadius: '6px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            background: '#e8e8e8',
            borderRadius: '6px',
            padding: '12px 8px',
            boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.12)',
          }}>
            <div
              ref={printRef}
              style={{
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: 1.4,
                color: '#000',
                background: '#fff',
                width: '302px',
                padding: '4px 10px 12px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
              }}
            >
              {/* Encabezado del negocio */}
              <div style={{ textAlign: 'center', marginBottom: '2px' }}>
                <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
                  {business?.name}
                </div>
                {business?.cuit && <div style={{ marginTop: '2px' }}>CUIT: {business.cuit}</div>}
                {business?.address && <div style={{ fontSize: '11px', marginTop: '1px' }}>{business.address}</div>}
                {business?.phone && <div style={{ fontSize: '11px' }}>Tel: {business.phone}</div>}
              </div>

              <div style={sep} />

              {/* Sucursal / Caja / Cajero / Fecha */}
              <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
                {(branchName || registerName) && (
                  <div>Suc: {branchName ?? ''}{registerName ? ` - ${registerName}` : ''}</div>
                )}
                {sellerName && <div>Cajero: {sellerName}</div>}
                <div>Fecha: {formatDateTime(sale.created_at)}</div>
                <div>N° Ticket: #{sale.id.slice(-8).toUpperCase()}</div>
                {customerName && <div>Cliente: {customerName}</div>}
              </div>

              <div style={sep} />

              {/* Encabezado columnas */}
              <div style={{ ...row, fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}>
                <span>DESCRIPCIÓN</span>
                <span>IMPORTE</span>
              </div>

              {/* Items */}
              {sale.items.map((item, i) => {
                const lineTotal = item.unit_price * item.quantity - item.discount
                return (
                  <div key={i} style={{ marginBottom: '6px' }}>
                    <div style={row}>
                      <span style={{ flex: 1, paddingRight: '8px', wordBreak: 'break-word' }}>
                        {item.quantity}x {item.product.name}
                      </span>
                      <span style={{ flexShrink: 0 }}>{formatCurrency(lineTotal)}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#333', fontWeight: 600 }}>
                      {'  '}c/u {formatCurrency(item.unit_price)}
                      {item.discount > 0 && <span> − dto {formatCurrency(item.discount)}</span>}
                    </div>
                  </div>
                )
              })}

              <div style={sep} />

              {/* Totales */}
              <div style={{ lineHeight: '1.6' }}>
                {(sale.discount > 0 || (sale.shipping_amount ?? 0) > 0) && (
                  <div style={row}><span>Subtotal</span><span>{formatCurrency(itemsSubtotal)}</span></div>
                )}
                {sale.discount > 0 && (
                  <div style={row}><span>Descuento</span><span>-{formatCurrency(sale.discount)}</span></div>
                )}
                {(sale.shipping_amount ?? 0) > 0 && (
                  <div style={row}><span>Envío</span><span>+{formatCurrency(sale.shipping_amount!)}</span></div>
                )}
                <div style={{ ...row, fontWeight: 'bold', fontSize: '14px', marginTop: '2px' }}>
                  <span>TOTAL</span>
                  <span>{formatCurrency(sale.total)}</span>
                </div>
                {sale.payment_splits && sale.payment_splits.length > 1 ? (
                  <div style={{ marginTop: '4px', fontSize: '11px' }}>
                    {sale.payment_splits.map((s, i) => (
                      <div key={i}>
                        {getPaymentMethodLabel(s.method)}: {formatCurrency(s.amount)}
                        {s.method === 'credito' && (s.installments ?? 1) > 1 && ` (${s.installments} cuotas)`}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: '4px', fontSize: '11px' }}>
                    Pago: {getPaymentMethodLabel(sale.payment_method)}
                    {sale.payment_method === 'credito' && sale.installments > 1
                      && ` (${sale.installments} cuotas)`}
                  </div>
                )}
              </div>

              <div style={sep} />

              {/* Estado de facturación */}
              {isInvoiced && invoice ? (
                <div style={{ textAlign: 'center', lineHeight: '1.6' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                    {invoiceTypeLabel(invoice.invoice_type)}
                  </div>
                  {invoice.numero !== undefined && (
                    <div>N°: {invoice.numero.toString().padStart(8, '0')}</div>
                  )}
                  <div>CAE: {invoice.afip_cae ?? invoice.cae}</div>
                  {(invoice.afip_cae_vto ?? invoice.cae_expiry) && (
                    <div>Vto. CAE: {invoice.afip_cae_vto ?? invoice.cae_expiry}</div>
                  )}
                  {invoice.receptor_name && <div>Receptor: {invoice.receptor_name}</div>}
                  {invoice.receptor_cuit && <div>CUIT Rec.: {invoice.receptor_cuit}</div>}
                </div>
              ) : (
                <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '2px 0', letterSpacing: '0.03em' }}>
                  *** NO VALIDO COMO FACTURA ***
                </div>
              )}

              <div style={sep} />

              {/* Footer */}
              <div style={{ textAlign: 'center', fontSize: '11px', lineHeight: '1.6' }}>
                <div>¡Gracias por su compra!</div>
                <div style={{ color: '#444', fontWeight: 700 }}>Powered by StockOS</div>
              </div>
            </div>
          </div>
          </div>

        </div>
      </div>

      {/* Modal convertir a factura */}
      {convertModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setConvertModal(false)}
        >
          <div
            className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-[var(--text)]">Convertir a factura</h2>
              <button onClick={() => setConvertModal(false)} className="p-1.5 rounded-[var(--radius-md)] text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 pt-4 pb-5 space-y-4 max-h-[80vh] overflow-y-auto">

              <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
                Ticket #{sale.id.slice(-8).toUpperCase()} · {formatCurrency(sale.total)}
              </div>

              {/* Tipo de factura */}
              <div>
                <label className="text-sm font-medium text-[var(--text2)] block mb-2">Tipo de factura *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['A', 'B', 'C'] as const).map(t => (
                    <button key={t} onClick={() => setConvertType(t)}
                      className={`py-2.5 text-sm font-semibold rounded-[var(--radius-md)] border transition-all ${convertType === t
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
                        }`}>
                      Factura {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text3)] mt-1.5">
                  {convertType === 'A' && 'Para empresas o responsables inscriptos en IVA'}
                  {convertType === 'B' && 'Para consumidores finales con datos del comprador'}
                  {convertType === 'C' && 'Para monotributistas'}
                </p>
              </div>

              {/* Condición IVA */}
              <div>
                <label className="text-sm font-medium text-[var(--text2)] block mb-1">Condición IVA receptor</label>
                <select value={receptorIva} onChange={e => setReceptorIva(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
                  <option value="CF">Consumidor Final</option>
                  <option value="RI">Responsable Inscripto</option>
                  <option value="M">Monotributista</option>
                  <option value="EX">Exento</option>
                </select>
              </div>

              <Input label={`Razón social / Nombre${convertType === 'A' ? ' *' : ''}`}
                value={receptorName} onChange={e => setReceptorName(e.target.value)}
                placeholder="Nombre o razón social" />

              <Input label={`CUIT${convertType === 'A' ? ' *' : ''}`}
                value={receptorCuit} onChange={e => setReceptorCuit(e.target.value)}
                placeholder="20-12345678-9" />

              <Input label="Domicilio"
                value={receptorAddress} onChange={e => setReceptorAddress(e.target.value)}
                placeholder="Dirección del receptor" />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setConvertModal(false)}
                  disabled={converting}
                  className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConvert}
                  disabled={converting}
                  className="px-4 py-2 text-sm font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {converting && <Loader2 size={14} className="animate-spin" />}
                  {converting ? 'Generando...' : `Generar Factura ${convertType}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
