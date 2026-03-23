'use client'
import { useRef } from 'react'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, Plus, X } from 'lucide-react'

interface CartItem {
  product:    { name: string; unit: string }
  quantity:   number
  unit_price: number
  discount:   number
}

interface TicketSale {
  id:             string
  total:          number
  subtotal:       number
  discount:       number
  payment_method: string
  installments:   number
  items:          CartItem[]
  created_at:     string
}

interface POSTicketProps {
  sale:       TicketSale
  onNewSale:  () => void
  onClose:    () => void
}

export function POSTicket({ sale, onNewSale, onClose }: POSTicketProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket de venta</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #000;
            background: #fff;
            padding: 16px;
            width: 300px;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .total-row { font-size: 15px; font-weight: bold; }
          .logo { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
          .item-name { flex: 1; margin-right: 8px; }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const itemsSubtotal = sale.items.reduce(
    (a, i) => a + i.unit_price * i.quantity - i.discount, 0
  )

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Acciones */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[var(--text)]">Venta registrada ✓</h2>
          <button onClick={onClose} className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)]">
            <X size={16} />
          </button>
        </div>

        {/* Ticket */}
        <div className="bg-white text-black rounded-[var(--radius-lg)] shadow-xl overflow-hidden">
          <div ref={printRef} style={{ fontFamily: "'Courier New', monospace", fontSize: '13px', padding: '20px', color: '#000' }}>

            {/* Header */}
            <div className="center" style={{ textAlign: 'center', marginBottom: '12px' }}>
              <div className="logo" style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>⚡ StockOS</div>
              <div style={{ fontSize: '11px', color: '#555' }}>Punto de Venta</div>
              <div style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                {formatDateTime(sale.created_at)}
              </div>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                #{sale.id.slice(-8).toUpperCase()}
              </div>
            </div>

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '10px 0' }} />

            {/* Items */}
            <div style={{ marginBottom: '8px' }}>
              {sale.items.map((item, i) => (
                <div key={i}>
                  <div className="row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="item-name" style={{ flex: 1, marginRight: '8px' }}>{item.product.name}</span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                      {formatCurrency(item.unit_price * item.quantity - item.discount)}
                    </span>
                  </div>
                  <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>
                    {item.quantity} {item.product.unit} × {formatCurrency(item.unit_price)}
                    {item.discount > 0 && ` − ${formatCurrency(item.discount)}`}
                  </div>
                </div>
              ))}
            </div>

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '10px 0' }} />

            {/* Subtotal y descuentos */}
            {sale.discount > 0 && (
              <>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(itemsSubtotal)}</span>
                </div>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', color: '#c00' }}>
                  <span>Descuento</span>
                  <span>− {formatCurrency(sale.discount)}</span>
                </div>
              </>
            )}

            {/* Total */}
            <div className="row total-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', marginTop: '6px' }}>
              <span>TOTAL</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>

            {/* Método de pago */}
            <div style={{ marginTop: '6px', color: '#555', fontSize: '11px', textAlign: 'center' }}>
              {getPaymentMethodLabel(sale.payment_method)}
              {sale.payment_method === 'credito' && sale.installments > 1 && ` — ${sale.installments} cuotas`}
            </div>

            <div className="divider" style={{ borderTop: '1px dashed #000', margin: '12px 0 8px' }} />

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#888' }}>
              ¡Gracias por su compra!
            </div>

          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
          >
            <Printer size={16} />
            Imprimir ticket
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors active:scale-95"
          >
            <Plus size={16} />
            Nueva venta
          </button>
        </div>

      </div>
    </div>
  )
}
