'use client'
import { useRef, useState, useEffect } from 'react'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, Plus, X, CheckCircle, CreditCard, MessageCircle, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

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
  payment_method: string
  installments: number
  items: CartItem[]
  created_at: string
}

interface BusinessInfo {
  name: string
  cuit?: string | null
  address?: string | null
  phone?: string | null
}

interface InvoiceInfo {
  id: string
  invoice_type: string
  numero?: number
  cae?: string
  cae_expiry?: string
  afip_status: string
  receptor_name?: string
  receptor_cuit?: string
}

interface POSTicketProps {
  sale: TicketSale
  onNewSale: () => void
  onClose: () => void
  customerPhone?: string
  customerName?: string
  business?: BusinessInfo
  branchName?: string
  registerName?: string
  sellerName?: string
}

export function POSTicket({
  sale, onNewSale, onClose,
  customerPhone, customerName,
  business, branchName, registerName, sellerName,
}: POSTicketProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null)
  const router = useRouter()

  const itemsSubtotal = sale.items.reduce(
    (a, i) => a + i.unit_price * i.quantity - i.discount, 0
  )

  useEffect(() => {
    if (!sale.id) return
    api.get<InvoiceInfo>(`/api/invoices/sale/${sale.id}`)
      .then((inv) => { if (inv) setInvoice(inv) })
      .catch(() => {})
  }, [sale.id])

  const isInvoiced = !!(invoice && invoice.afip_status === 'authorized' && invoice.cae)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:0;'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }

    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket</title>
  <style>
    @page { size: 80mm auto; margin: 2mm 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; background: #fff; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #000;
    }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`)
    doc.close()

    iframe.onload = () => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }
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

  // Styles shared between screen and print (all inline for print compatibility)
  const sep: React.CSSProperties = {
    borderTop: '1px dashed #999',
    margin: '8px 0',
  }
  const row: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  }

  const invoiceTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      A: 'FACTURA A', B: 'FACTURA B', C: 'FACTURA C',
      NCA: 'NOTA DE CRÉDITO A', NCB: 'NOTA DE CRÉDITO B', NCC: 'NOTA DE CRÉDITO C',
      R: 'REMITO',
    }
    return map[type] ?? `COMPROBANTE ${type}`
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-sm space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Venta registrada</p>
            <p className="text-xs text-[var(--text3)]">{formatDateTime(sale.created_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-[var(--text3)] hover:bg-[var(--surface2)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Ticket paper wrapper (only on screen, not printed) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          background: '#f0f0f0',
          borderRadius: '4px',
          padding: '12px 8px',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.1)',
        }}>
          {/* printRef: this content is what gets printed */}
          <div
            ref={printRef}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '11px',
              color: '#000',
              background: '#fff',
              width: '302px',
              padding: '12px 10px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
            }}
          >
            {/* ── Encabezado del negocio ── */}
            <div style={{ textAlign: 'center', marginBottom: '2px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
                {business?.name}
              </div>
              {business?.cuit && (
                <div style={{ marginTop: '2px' }}>CUIT: {business.cuit}</div>
              )}
              {business?.address && (
                <div style={{ fontSize: '10px', marginTop: '1px' }}>{business.address}</div>
              )}
              {business?.phone && (
                <div style={{ fontSize: '10px' }}>Tel: {business.phone}</div>
              )}
            </div>

            <div style={sep} />

            {/* ── Sucursal / Caja / Cajero / Fecha ── */}
            <div style={{ fontSize: '11px', lineHeight: '1.5' }}>
              {(branchName || registerName) && (
                <div>
                  Suc: {branchName ?? ''}
                  {registerName ? ` - ${registerName}` : ''}
                </div>
              )}
              {sellerName && <div>Cajero: {sellerName}</div>}
              <div>Fecha: {formatDateTime(sale.created_at)}</div>
              <div>N° Ticket: #{sale.id.slice(-8).toUpperCase()}</div>
              {customerName && <div>Cliente: {customerName}</div>}
            </div>

            <div style={sep} />

            {/* ── Encabezado columnas ── */}
            <div style={{ ...row, fontWeight: 'bold', fontSize: '10px', marginBottom: '6px' }}>
              <span>DESCRIPCIÓN</span>
              <span>IMPORTE</span>
            </div>

            {/* ── Items ── */}
            {sale.items.map((item, i) => {
              const lineTotal = item.unit_price * item.quantity - item.discount
              return (
                <div key={i} style={{ marginBottom: '6px' }}>
                  <div style={row}>
                    <span style={{ flex: 1, paddingRight: '8px', wordBreak: 'break-word' }}>
                      {item.quantity} {item.product.unit} {item.product.name}
                    </span>
                    <span style={{ flexShrink: 0 }}>{formatCurrency(lineTotal)}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#555' }}>
                    {'  '}c/u {formatCurrency(item.unit_price)}
                    {item.discount > 0 && (
                      <span> − dto {formatCurrency(item.discount)}</span>
                    )}
                  </div>
                </div>
              )
            })}

            <div style={sep} />

            {/* ── Totales ── */}
            <div style={{ lineHeight: '1.6' }}>
              {sale.discount > 0 && (
                <>
                  <div style={row}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(itemsSubtotal)}</span>
                  </div>
                  <div style={row}>
                    <span>Descuento</span>
                    <span>-{formatCurrency(sale.discount)}</span>
                  </div>
                </>
              )}
              <div style={{ ...row, fontWeight: 'bold', fontSize: '14px', marginTop: '2px' }}>
                <span>TOTAL</span>
                <span>{formatCurrency(sale.total)}</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px' }}>
                Pago: {getPaymentMethodLabel(sale.payment_method)}
                {sale.payment_method === 'credito' && sale.installments > 1
                  && ` (${sale.installments} cuotas)`}
              </div>
            </div>

            <div style={sep} />

            {/* ── Estado de facturación ── */}
            {isInvoiced && invoice ? (
              <div style={{ textAlign: 'center', lineHeight: '1.6' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
                  {invoiceTypeLabel(invoice.invoice_type)}
                </div>
                {invoice.numero !== undefined && (
                  <div>N°: {invoice.numero.toString().padStart(8, '0')}</div>
                )}
                <div>CAE: {invoice.cae}</div>
                {invoice.cae_expiry && (
                  <div>Vto. CAE: {invoice.cae_expiry}</div>
                )}
                {invoice.receptor_name && (
                  <div>Receptor: {invoice.receptor_name}</div>
                )}
                {invoice.receptor_cuit && (
                  <div>CUIT Rec.: {invoice.receptor_cuit}</div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '2px 0', letterSpacing: '0.03em' }}>
                *** NO VALIDO COMO FACTURA ***
              </div>
            )}

            <div style={sep} />

            {/* ── Footer ── */}
            <div style={{ textAlign: 'center', fontSize: '10px', lineHeight: '1.6' }}>
              <div>¡Gracias por su compra!</div>
              <div style={{ color: '#888' }}>Powered by StockOS</div>
            </div>
          </div>
        </div>

        {/* ── Botones de acción ── */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] transition-colors active:scale-95"
            >
              <Printer size={15} />
              Imprimir
            </button>
            <button
              onClick={handleShareWhatsApp}
              disabled={sharing}
              className="flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[#25d366] text-white text-sm font-medium hover:bg-[#20bd5a] transition-colors active:scale-95 disabled:opacity-60"
            >
              {sharing ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
              WhatsApp
            </button>
            <button
              onClick={() => {
                if (invoice?.id) {
                  router.push(`/invoices?facturar=${invoice.id}`)
                } else {
                  router.push(`/invoices?sale_id=${sale.id}`)
                }
              }}
              className="flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] transition-colors active:scale-95"
            >
              <CreditCard size={15} />
              Facturar
            </button>
          </div>
          <button
            onClick={onNewSale}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors active:scale-95"
          >
            <Plus size={15} />
            Nueva venta
          </button>
        </div>

      </div>
    </div>
  )
}
