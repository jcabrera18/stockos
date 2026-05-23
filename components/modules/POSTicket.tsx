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
  NCA: 'NOTA DE CRÉDITO A', NCB: 'NOTA DE CRÉDITO B', NCC: 'NOTA DE CRÉDITO C',
  NDA: 'NOTA DE DÉBITO A', NDB: 'NOTA DE DÉBITO B', NDC: 'NOTA DE DÉBITO C',
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
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

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

  useEffect(() => {
    if (!invoice || invoice.afip_status !== 'authorized') { setQrDataUrl(''); return }
    const cae = invoice.afip_cae ?? invoice.cae
    if (!cae || !business?.cuit) { setQrDataUrl(''); return }
    const url = buildAfipQrUrl(invoice, business.cuit, business.afip_punto_venta ?? 1)
    QRCode.toDataURL(url, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [invoice, business])

  useEffect(() => {
    if (!open || convertModal) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); handlePrint() }
      if (e.key === 'w' || e.key === 'W') { e.preventDefault(); handleShareWhatsApp() }
      const canConvertOrRetry = invoice?.invoice_type === 'X' ||
        (invoice && ['rejected', 'pending'].includes(invoice.afip_status) && ['A', 'B', 'C'].includes(invoice.invoice_type))
      if ((e.key === 'f' || e.key === 'F') && canConvertOrRetry) {
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

  const ivaCondition = business?.iva_condition ?? ''
  // MO: solo C · RI: A y B · EX: B y C · sin configurar: todos
  const allowedConvertTypes: ('A' | 'B' | 'C')[] =
    ivaCondition === 'MO' ? ['C'] :
    ivaCondition === 'RI' ? ['A', 'B'] :
    ivaCondition === 'EX' ? ['B', 'C'] :
    ['A', 'B', 'C']

  const openConvertModal = () => {
    // Al reintentar, pre-llenar con el tipo actual del invoice si está permitido
    const currentType = invoice?.invoice_type as 'A' | 'B' | 'C' | undefined
    const defaultType = currentType && allowedConvertTypes.includes(currentType) ? currentType : allowedConvertTypes[0]
    setConvertType(defaultType)
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

    const sep = `<hr style="border:none;border-top:1px dashed #000;margin:10px 0;">`
    const row = (left: string, right: string) =>
      `<div style="display:flex;justify-content:space-between;align-items:baseline;">${left}${right}</div>`
    const metaRow = (label: string, value: string) =>
      `<div style="display:flex;justify-content:space-between;align-items:baseline;line-height:1.8;">
        <span style="font-size:10px;letter-spacing:0.08em;text-transform:uppercase;">${label}</span>
        <span style="font-weight:700;">${value}</span>
      </div>`

    const bizInfoGrid = [
      biz?.cuit ? `<div><div style="font-size:8px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.1em;">CUIT</div><div style="font-size:11px;font-weight:700;">${biz.cuit}</div></div>` : '',
      biz?.iva_condition ? `<div><div style="font-size:8px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.1em;">Cond. IVA</div><div style="font-size:11px;font-weight:700;">${IVA_LABELS[biz.iva_condition] ?? biz.iva_condition}</div></div>` : '',
      biz?.address ? `<div><div style="font-size:8px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.1em;">Domicilio</div><div style="font-size:11px;font-weight:700;">${biz.address}</div></div>` : '',
      biz?.phone ? `<div><div style="font-size:8px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.1em;">Teléfono</div><div style="font-size:11px;font-weight:700;">${biz.phone}</div></div>` : '',
    ].filter(Boolean).join('')

    const html = `
      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:16px;font-weight:800;letter-spacing:0.02em;">${biz?.name ?? ''}</div>
        ${bizInfoGrid ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-top:8px;text-align:left;">${bizInfoGrid}</div>` : ''}
      </div>
      ${sep}
      <div style="text-align:center;">
        <div style="font-size:15px;font-weight:800;letter-spacing:0.06em;">${typeLabel.toUpperCase()}</div>
        <div style="font-size:12px;font-weight:700;margin-top:2px;letter-spacing:0.04em;">N° ${ptoVenta}-${numero}</div>
      </div>
      ${sep}
      <div style="font-size:11px;line-height:1.8;">
        ${metaRow('Receptor', inv.receptor_name ?? customerName ?? 'Consumidor Final')}
        ${inv.receptor_cuit ? metaRow('CUIT', inv.receptor_cuit) : ''}
        ${inv.receptor_address ? `<div style="font-size:11px;">${inv.receptor_address}</div>` : ''}
        ${metaRow('Cond. IVA', IVA_LABELS[inv.receptor_iva_condition ?? 'CF'] ?? (inv.receptor_iva_condition ?? 'CF'))}
      </div>
      ${sep}
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;">Descripción</span>
        <span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;">Importe</span>
      </div>
      <div>
        ${(inv.invoice_items ?? []).map(item => `
          <div style="margin-bottom:9px;">
            ${row(
              `<span style="flex:1;padding-right:8px;word-break:break-word;">${item.quantity}x ${item.description}</span>`,
              `<span style="flex-shrink:0;font-weight:700;">${fmt(item.subtotal)}</span>`
            )}
            <div style="font-size:10px;opacity:0.7;">c/u ${fmt(item.unit_price)}</div>
          </div>
        `).join('')}
      </div>
      ${sep}
      ${isA ? `
        ${row('<span style="font-size:11px;">Neto gravado</span>', `<span style="font-weight:700;">${fmt(inv.net_amount ?? 0)}</span>`)}
        ${row('<span style="font-size:11px;">IVA 21%</span>', `<span style="font-weight:700;">${fmt(inv.iva_amount ?? 0)}</span>`)}
        <div style="border-top:1px solid #000;margin:6px 0;"></div>
      ` : ''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:2px;">
        <span style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Total</span>
        <span style="font-size:18px;font-weight:800;">${fmt(inv.total_amount ?? 0)}</span>
      </div>
      ${sep}
      ${cae ? `
        <div style="text-align:center;font-size:11px;line-height:1.8;">
          <div style="font-weight:700;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">Comprobante autorizado</div>
          <div>CAE: <strong>${cae}</strong></div>
          ${inv.afip_cae_vto ?? inv.cae_expiry ? `<div>Vto. CAE: ${inv.afip_cae_vto ?? inv.cae_expiry}</div>` : ''}
          ${qrDataUrl ? `
            <div style="margin:10px 0 4px;">
              <img src="${qrDataUrl}" style="width:110px;height:110px;" />
            </div>
            <div style="font-size:10px;margin-bottom:6px;">Verificar en afip.gob.ar/fe/qr</div>
            <div style="margin:6px 0;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 58" width="110" height="38">
                <text x="85" y="38" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" font-weight="900" fill="#000">ARCA</text>
                <text x="85" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#000" letter-spacing="1">AGENCIA DE RECAUDACION</text>
                <text x="85" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.5" fill="#000" letter-spacing="1">Y CONTROL ADUANERO</text>
              </svg>
            </div>
          ` : ''}
        </div>
      ` : `
        <div style="text-align:center;font-size:10px;letter-spacing:0.06em;padding:2px 0;">NO VÁLIDO COMO FACTURA</div>
      `}
      ${sep}
      <div style="text-align:center;font-size:11px;line-height:1.8;">
        <div style="font-weight:700;">¡Gracias por su compra!</div>
        <div style="font-size:10px;opacity:0.6;">stockos.digital</div>
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
        body { font-family: 'Courier New', Courier, monospace; font-size: 12px; font-weight: 700; line-height: 1.5; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        hr { border: none !important; border-top: 1px dashed #000 !important; margin: 10px 0 !important; }
      </style>
    </head><body><div style="padding:10px 12px 16px;">${html}</div></body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleConvert = async () => {
    if (!invoice) return
    if (!allowedConvertTypes.includes(convertType)) {
      toast.error(`Tu condición IVA (${IVA_LABELS[ivaCondition] ?? ivaCondition}) no permite emitir Factura ${convertType}`)
      return
    }
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

    // Escalar font-sizes directamente en el HTML — orden de mayor a menor para evitar doble reemplazo
    const printHtml = content.innerHTML
      .replace(/font-size: 26px/g, 'font-size: 52px')
      .replace(/font-size: 22px/g, 'font-size: 44px')
      .replace(/font-size: 17px/g, 'font-size: 36px')
      .replace(/font-size: 15px/g, 'font-size: 32px')
      .replace(/font-size: 14px/g, 'font-size: 30px')
      .replace(/font-size: 13px/g, 'font-size: 28px')
      .replace(/font-size: 12px/g, 'font-size: 28px')
      .replace(/font-size: 11px/g, 'font-size: 26px')
      .replace(/font-size: 10px/g, 'font-size: 24px')
      .replace(/font-size: 9px/g,  'font-size: 20px')
      .replace(/font-size: 8px/g,  'font-size: 18px')
      // Todo en negro: colores hex y rgb normalizados por el browser
      .replace(/color: #(111|222|333|444|555|666|777|888|999|aaa|bbb|ccc|ddd|eee)/g, 'color: #000')
      .replace(/color: rgb\((\d{1,3}),\s*\1,\s*\1\)/g, 'color: #000')
      // Eliminar opacidades que crean gris visual aunque el color sea negro
      .replace(/opacity: 0\.\d+/g, 'opacity: 1')

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket</title>
  <style>
    @page { margin: 1mm 3mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; background: #fff; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 17px;
      font-weight: 400;
      line-height: 1.7;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body > div { width: 100% !important; max-width: 100% !important; box-shadow: none !important; padding: 8px 4px 14px !important; background: #fff !important; }
    hr { border: none !important; border-top: 1px dashed #666 !important; margin: 10px 0 !important; }
  </style>
</head>
<body>${printHtml}</body>
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

  // Separator: <hr style={sepStyle} />
  const sepStyle: React.CSSProperties = {
    border: 'none',
    borderTop: '1px dashed #ccc',
    margin: '12px 0',
    width: '100%',
  }

  const invoiceTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      A: 'Factura A', B: 'Factura B', C: 'Factura C',
      NCA: 'Nota de Crédito A', NCB: 'Nota de Crédito B', NCC: 'Nota de Crédito C',
      R: 'Remito',
    }
    return map[type] ?? `Comprobante ${type}`
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
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

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={isInvoiced && invoice ? () => handlePrintInvoiceTicket(invoice) : handlePrint}
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
              {(() => {
                const canConvert = invoice?.invoice_type === 'X'
                const canRetry = invoice && ['rejected', 'pending'].includes(invoice.afip_status) && ['A', 'B', 'C'].includes(invoice.invoice_type)
                const isClickable = canConvert || canRetry
                return (
                  <button
                    onClick={() => isClickable ? openConvertModal() : undefined}
                    disabled={!invoice || !isClickable}
                    className="flex flex-col items-center justify-center gap-1 py-3 rounded-[var(--radius-md)] bg-white/10 border border-white/20 text-sm font-medium text-white hover:bg-white/20 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {!invoice
                      ? <Loader2 size={15} className="animate-spin" />
                      : <CreditCard size={15} />
                    }
                    <span>{canRetry ? 'Reintentar' : 'Facturar'}</span>
                    <kbd className="text-[10px] bg-white/10 border border-white/20 px-1.5 rounded font-sans leading-tight">F</kbd>
                  </button>
                )
              })()}
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

          {/* Ticket paper — scrollable */}
          <div className="overflow-y-auto" style={{ borderRadius: '6px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              background: '#e2e2e2',
              borderRadius: '6px',
              padding: '16px 8px',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.14)',
            }}>
              <div
                ref={printRef}
                style={{
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
                  fontSize: '12px',
                  fontWeight: 400,
                  lineHeight: 1.65,
                  color: '#111',
                  background: '#fff',
                  width: '302px',
                  padding: '22px 18px 26px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08)',
                }}
              >
                {/* Business header — siempre visible */}
                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '0.01em', color: '#000', marginBottom: '8px' }}>
                    {business?.name}
                  </div>
                  {(business?.cuit || business?.iva_condition || business?.address || business?.phone) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', marginTop: '8px', textAlign: 'left' }}>
                      {business?.cuit && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CUIT</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{business.cuit}</div>
                        </div>
                      )}
                      {business?.iva_condition && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cond. IVA</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{IVA_LABELS[business.iva_condition] ?? business.iva_condition}</div>
                        </div>
                      )}
                      {business?.address && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Domicilio</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{business.address}</div>
                        </div>
                      )}
                      {business?.phone && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Teléfono</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{business.phone}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <hr style={sepStyle} />

                {isInvoiced && invoice ? (
                  /* ── LAYOUT FACTURA ARCA ── */
                  <>
                    {/* Tipo + N° de comprobante */}
                    <div style={{ textAlign: 'center', padding: '4px 0' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#000' }}>
                        {invoiceTypeLabel(invoice.invoice_type)}
                      </div>
                      {invoice.numero !== undefined && (
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#555', marginTop: '3px', fontFamily: 'monospace' }}>
                          N° {String(business?.afip_punto_venta ?? 1).padStart(5, '0')}-{invoice.numero.toString().padStart(8, '0')}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', color: '#999', marginTop: '3px' }}>
                        {formatDateTime(sale.created_at)}
                      </div>
                    </div>

                    <hr style={sepStyle} />

                    {/* Receptor */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
                      <div>
                        <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Receptor</div>
                        <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{invoice.receptor_name ?? customerName ?? 'Consumidor Final'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cond. IVA</div>
                        <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{IVA_LABELS[invoice.receptor_iva_condition ?? 'CF'] ?? invoice.receptor_iva_condition}</div>
                      </div>
                      {invoice.receptor_cuit && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CUIT</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{invoice.receptor_cuit}</div>
                        </div>
                      )}
                      {invoice.receptor_address && (
                        <div>
                          <div style={{ fontSize: '8px', fontWeight: 600, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Domicilio</div>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#444' }}>{invoice.receptor_address}</div>
                        </div>
                      )}
                    </div>

                    <hr style={sepStyle} />

                    {/* Columnas de items */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Descripción</span>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Importe</span>
                    </div>

                    {/* Items de la factura */}
                    {(invoice.invoice_items ?? []).map((item, i) => (
                      <div key={i} style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ flex: 1, paddingRight: '10px', fontWeight: 500, color: '#111', lineHeight: 1.2 }}>
                            {item.description}
                          </span>
                          <span style={{ flexShrink: 0, fontWeight: 700, color: '#000', lineHeight: 1.2 }}>{formatCurrency(item.subtotal)}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '1px' }}>
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </div>
                      </div>
                    ))}

                    <hr style={sepStyle} />

                    {/* Subtotales fiscales (solo Factura A) */}
                    {invoice.invoice_type === 'A' && (
                      <div style={{ fontSize: '11px', lineHeight: 1.9, marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                          <span>Neto gravado</span><span>{formatCurrency(invoice.net_amount ?? 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                          <span>IVA 21%</span><span>{formatCurrency(invoice.iva_amount ?? 0)}</span>
                        </div>
                      </div>
                    )}

                    {/* Total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '2px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</span>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: '#000', letterSpacing: '-0.02em' }}>{formatCurrency(invoice.total_amount ?? sale.total)}</span>
                    </div>

                    {/* Forma de pago */}
                    <div style={{ marginTop: '8px' }}>
                      {sale.payment_splits && sale.payment_splits.length > 1 ? (
                        <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.8 }}>
                          {sale.payment_splits.map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{getPaymentMethodLabel(s.method)}</span>
                              <span style={{ fontWeight: 500, color: '#444' }}>
                                {formatCurrency(s.amount)}
                                {s.method === 'credito' && (s.installments ?? 1) > 1 && ` (${s.installments} ctas)`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          <span style={{ fontWeight: 500, color: '#444' }}>
                            {getPaymentMethodLabel(sale.payment_method)}
                            {sale.payment_method === 'credito' && sale.installments > 1 && ` · ${sale.installments} cuotas`}
                          </span>
                        </div>
                      )}
                    </div>

                    <hr style={sepStyle} />

                    {/* CAE + QR ARCA */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Comprobante autorizado por ARCA
                      </div>
                      <div style={{ fontSize: '11px', color: '#444', marginTop: '6px' }}>
                        CAE: <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '10px' }}>{invoice.afip_cae ?? invoice.cae}</span>
                      </div>
                      {(invoice.afip_cae_vto ?? invoice.cae_expiry) && (
                        <div style={{ fontSize: '11px', color: '#777' }}>
                          Vto.: {invoice.afip_cae_vto ?? invoice.cae_expiry}
                        </div>
                      )}
                      {qrDataUrl && (
                        <img src={qrDataUrl} style={{ width: '110px', height: '110px', display: 'block', margin: '12px auto 4px' }} alt="QR ARCA" />
                      )}
                      <div style={{ fontSize: '9px', color: '#ccc', marginBottom: '8px' }}>
                        Verificar en afip.gob.ar/fe/qr
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 58" width="90" height="31" style={{ display: 'block', margin: '0 auto' }}>
                        <text x="85" y="38" textAnchor="middle" fontFamily="Arial Black,Arial" fontSize="44" fontWeight="900" fill="#000">ARCA</text>
                        <text x="85" y="49" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="7.5" fill="#000" letterSpacing="1">AGENCIA DE RECAUDACION</text>
                        <text x="85" y="58" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="7.5" fill="#000" letterSpacing="1">Y CONTROL ADUANERO</text>
                      </svg>
                    </div>

                    <hr style={sepStyle} />

                    <div style={{ textAlign: 'center', lineHeight: 1.8 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>¡Gracias por su compra!</div>
                      <div style={{ fontSize: '10px', color: '#ccc', marginTop: '2px', letterSpacing: '0.05em' }}>stockos.digital</div>
                    </div>
                  </>
                ) : (
                  /* ── LAYOUT TICKET SIMPLE ── */
                  <>
                    {/* Meta: sucursal / cajero / fecha / ticket# / cliente */}
                    <div style={{ fontSize: '11px', lineHeight: 1.9 }}>
                      {(branchName || registerName) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Sucursal</span>
                          <span style={{ fontWeight: 500, color: '#222' }}>{branchName ?? ''}{registerName ? ` · ${registerName}` : ''}</span>
                        </div>
                      )}
                      {sellerName && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cajero</span>
                          <span style={{ fontWeight: 500, color: '#222' }}>{sellerName}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fecha</span>
                        <span style={{ fontWeight: 500, color: '#222' }}>{formatDateTime(sale.created_at)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Ticket</span>
                        <span style={{ fontWeight: 700, color: '#000', fontFamily: 'monospace', fontSize: '12px' }}>
                          #{sale.id.slice(-8).toUpperCase()}
                        </span>
                      </div>
                      {customerName && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cliente</span>
                          <span style={{ fontWeight: 500, color: '#222' }}>{customerName}</span>
                        </div>
                      )}
                    </div>

                    <hr style={sepStyle} />

                    {/* Columnas de items */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Producto</span>
                      <span style={{ fontSize: '9px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</span>
                    </div>

                    {/* Items de la venta */}
                    {sale.items.map((item, i) => {
                      const lineTotal = item.unit_price * item.quantity - item.discount
                      return (
                        <div key={i} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ flex: 1, paddingRight: '10px', fontSize: '15px', fontWeight: 600, color: '#111', lineHeight: 1.2 }}>
                              {item.product.name}
                            </span>
                            <span style={{ flexShrink: 0, fontSize: '15px', fontWeight: 700, color: '#000', lineHeight: 1.2 }}>{formatCurrency(lineTotal)}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '1px' }}>
                            {item.quantity} × {formatCurrency(item.unit_price)}
                            {item.discount > 0 && <span> · dto -{formatCurrency(item.discount)}</span>}
                          </div>
                        </div>
                      )
                    })}

                    <hr style={sepStyle} />

                    {/* Subtotales opcionales */}
                    {(sale.discount > 0 || (sale.shipping_amount ?? 0) > 0) && (
                      <div style={{ fontSize: '11px', lineHeight: 1.9, marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                          <span>Subtotal</span><span>{formatCurrency(itemsSubtotal)}</span>
                        </div>
                        {sale.discount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
                            <span>Descuento</span><span>-{formatCurrency(sale.discount)}</span>
                          </div>
                        )}
                        {(sale.shipping_amount ?? 0) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                            <span>Envío</span><span>+{formatCurrency(sale.shipping_amount!)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '2px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</span>
                      <span style={{ fontSize: '26px', fontWeight: 800, color: '#000', letterSpacing: '-0.02em' }}>{formatCurrency(sale.total)}</span>
                    </div>

                    {/* Forma de pago */}
                    <div style={{ marginTop: '8px' }}>
                      {sale.payment_splits && sale.payment_splits.length > 1 ? (
                        <div style={{ fontSize: '11px', color: '#666', lineHeight: 1.8 }}>
                          {sale.payment_splits.map((s, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{getPaymentMethodLabel(s.method)}</span>
                              <span style={{ fontWeight: 500, color: '#444' }}>
                                {formatCurrency(s.amount)}
                                {s.method === 'credito' && (s.installments ?? 1) > 1 && ` (${s.installments} ctas)`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          <span style={{ fontWeight: 500, color: '#444' }}>
                            {getPaymentMethodLabel(sale.payment_method)}
                            {sale.payment_method === 'credito' && sale.installments > 1 && ` · ${sale.installments} cuotas`}
                          </span>
                        </div>
                      )}
                    </div>

                    <hr style={sepStyle} />

                    <div style={{ textAlign: 'center', fontSize: '10px', color: '#bbb', letterSpacing: '0.06em', padding: '2px 0' }}>
                      NO VÁLIDO COMO FACTURA
                    </div>

                    <hr style={sepStyle} />

                    <div style={{ textAlign: 'center', lineHeight: 1.8 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>¡Gracias por su compra!</div>
                      <div style={{ fontSize: '10px', color: '#ccc', marginTop: '2px', letterSpacing: '0.05em' }}>stockos.digital</div>
                    </div>
                  </>
                )}
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

              <div>
                <label className="text-sm font-medium text-[var(--text2)] block mb-2">Tipo de factura *</label>
                {allowedConvertTypes.length === 1 && (
                  <p className="text-xs text-[var(--text3)] mb-2">
                    Tu condición IVA ({IVA_LABELS[ivaCondition] ?? ivaCondition}) solo permite emitir Factura {allowedConvertTypes[0]}.
                  </p>
                )}
                <div className={`grid gap-2 grid-cols-${allowedConvertTypes.length}`}>
                  {allowedConvertTypes.map(t => (
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
                  {convertType === 'C' && 'Para monotributistas y exentos'}
                </p>
              </div>

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
