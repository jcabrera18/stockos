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

interface POSTicketProps {
  sale: TicketSale
  onNewSale: () => void
  onClose: () => void
  customerPhone?: string
}

export function POSTicket({ sale, onNewSale, onClose, customerPhone }: POSTicketProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [invoiceModal, setInvoiceModal] = useState(false)
  const [sharing, setSharing] = useState(false)

  const itemsSubtotal = sale.items.reduce(
    (a, i) => a + i.unit_price * i.quantity - i.discount, 0
  )
  const itemCount = sale.items.reduce((a, i) => a + i.quantity, 0)

  const router = useRouter()
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    if (!sale.id) return
    api.get(`/api/invoices/sale/${sale.id}`)
      .then((inv: unknown) => {
        const i = inv as { id: string; invoice_type: string } | null
        if (i && i.invoice_type === 'X') setInvoiceId(i.id)
      })
      .catch(() => { })
  }, [sale.id])

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

      // Mobile / browsers que soportan Web Share API con archivos
      if (navigator.canShare?.({ files: [new File([blob], 'ticket.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([blob], `ticket-${sale.id.slice(-8)}.png`, { type: 'image/png' })],
          title: 'Comprobante de compra',
        })
        return
      }

      // Desktop: copiar al portapapeles + abrir WhatsApp Web
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])

      const phone = customerPhone?.replace(/\D/g, '')
      const url = phone
        ? `https://web.whatsapp.com/send?phone=${phone}`
        : 'https://web.whatsapp.com/'
      window.open(url, '_blank')

      toast.success('Imagen copiada — pegala en el chat con Ctrl+V', { duration: 6000 })
    } catch (err) {
      toast.error('No se pudo generar la imagen')
      console.error(err)
    } finally {
      setSharing(false)
    }
  }

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket StockOS</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600;700&display=swap');
          * { margin:0; padding:0; box-sizing:border-box; }
          body {
            font-family: 'Inter', sans-serif;
            background: #fff;
            color: #1a1a18;
            padding: 0;
            width: 380px;
          }
          .mono { font-family: 'IBM Plex Mono', monospace; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-sm space-y-4">

        {/* Éxito */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0">
            <CheckCircle size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Venta registrada</p>
            <p className="text-xs text-[var(--text3)]">{formatDateTime(sale.created_at)}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-[var(--text3)] hover:bg-[var(--surface2)]">
            <X size={16} />
          </button>
        </div>

        {/* ── Ticket visual ── */}
        <div
          ref={printRef}
          style={{
            background: '#ffffff',
            color: '#1a1a18',
            fontFamily: "'Inter', sans-serif",
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          }}
        >
          {/* Header con degradado */}
          <div style={{
            background: 'linear-gradient(135deg, #15803d 0%, #16a34a 60%, #22c55e 100%)',
            padding: '24px 20px 20px',
            color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  StockOS · Punto de Venta
                </div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>{formatDateTime(sale.created_at)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>Comprobante</div>
                <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em' }}>
                  #{sale.id.slice(-8).toUpperCase()}
                </div>
              </div>
            </div>

            {/* Total grande */}
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Total pagado
              </div>
              <div style={{ fontSize: '40px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {formatCurrency(sale.total)}
              </div>
            </div>

            {/* Método de pago */}
            <div style={{
              marginTop: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '20px',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {sale.payment_method === 'efectivo' && '💵'}
              {sale.payment_method === 'debito' && '💳'}
              {sale.payment_method === 'credito' && '💳'}
              {sale.payment_method === 'transferencia' && '🏦'}
              {sale.payment_method === 'qr' && '📱'}
              {sale.payment_method === 'cuenta_corriente' && '📒'}
              {' '}{getPaymentMethodLabel(sale.payment_method)}
              {sale.payment_method === 'credito' && sale.installments > 1 && ` · ${sale.installments} cuotas`}
            </div>
          </div>

          {/* Separador dentado */}
          <div style={{
            background: '#f5f5f4',
            height: '16px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: '-8px',
              left: 0,
              right: 0,
              height: '16px',
              background: 'radial-gradient(circle at 50% 0%, #f5f5f4 8px, transparent 8px)',
              backgroundSize: '20px 16px',
              backgroundRepeat: 'repeat-x',
            }} />
          </div>

          {/* Cuerpo del ticket */}
          <div style={{ background: '#f5f5f4', padding: '0 20px 20px' }}>

            {/* Resumen */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              paddingTop: '4px',
            }}>
              <div style={{
                flex: 1,
                background: '#fff',
                borderRadius: '10px',
                padding: '10px 12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>{itemCount}</div>
                <div style={{ fontSize: '10px', color: '#6a6a64', marginTop: '1px' }}>
                  {itemCount === 1 ? 'producto' : 'productos'}
                </div>
              </div>
              <div style={{
                flex: 1,
                background: '#fff',
                borderRadius: '10px',
                padding: '10px 12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>{sale.items.length}</div>
                <div style={{ fontSize: '10px', color: '#6a6a64', marginTop: '1px' }}>
                  {sale.items.length === 1 ? 'artículo' : 'artículos'}
                </div>
              </div>
              {sale.discount > 0 && (
                <div style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: '#dc2626' }}>
                    -{formatCurrency(sale.discount).replace('$', '')}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6a6a64', marginTop: '1px' }}>descuento</div>
                </div>
              )}
            </div>

            {/* Lista de productos */}
            <div style={{
              background: '#fff',
              borderRadius: '10px',
              overflow: 'hidden',
              marginBottom: '12px',
            }}>
              <div style={{
                padding: '10px 14px',
                borderBottom: '1px solid #e5e5e2',
                fontSize: '10px',
                fontWeight: 600,
                color: '#6a6a64',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span>Detalle</span>
                <span>Importe</span>
              </div>
              {sale.items.map((item, i) => (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderBottom: i < sale.items.length - 1 ? '1px solid #f5f5f4' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1a1a18' }}>
                      {item.product.name}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8a8a84', marginTop: '2px' }}>
                      {item.quantity} {item.product.unit} × {formatCurrency(item.unit_price)}
                      {item.discount > 0 && (
                        <span style={{ color: '#dc2626' }}> − {formatCurrency(item.discount)}</span>
                      )}
                    </div>
                    {item.applied_list && (
                      <div style={{ fontSize: '9px', color: '#16a34a', marginTop: '1px' }}>
                        Lista {item.applied_list}{item.applied_margin !== undefined ? ` (+${item.applied_margin}%)` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: '#1a1a18',
                    flexShrink: 0,
                  }}>
                    {formatCurrency(item.unit_price * item.quantity - item.discount)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              {sale.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6a6a64', marginBottom: '6px' }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatCurrency(itemsSubtotal)}</span>
                </div>
              )}
              {sale.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>
                  <span>Descuento</span>
                  <span style={{ fontFamily: 'monospace' }}>− {formatCurrency(sale.discount)}</span>
                </div>
              )}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '15px',
                fontWeight: 700,
                paddingTop: sale.discount > 0 ? '8px' : '0',
                borderTop: sale.discount > 0 ? '1px dashed #e5e5e2' : 'none',
              }}>
                <span>Total</span>
                <span style={{ fontFamily: 'monospace', color: '#15803d' }}>{formatCurrency(sale.total)}</span>
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#8a8a84', marginBottom: '6px' }}>
                ¡Gracias por su compra!
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                color: '#b4b2a9',
              }}>
                <span>⚡</span>
                <span>Powered by StockOS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botones */}
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


            {invoiceId && (
              <button
                onClick={() => router.push(`/invoices?facturar=${invoiceId}`)}
                className="flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] transition-colors active:scale-95"
              >
                <CreditCard size={15} />
                Factura
              </button>
            )}

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
