'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, CreditCard, Package, User, Calendar, Hash } from 'lucide-react'

interface SaleItem {
  id: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  products: { name: string; barcode?: string; unit: string }
}

interface SaleDetail {
  id: string
  total: number
  subtotal: number
  discount: number
  payment_method: string
  installments: number
  notes?: string
  created_at: string
  users?: { full_name: string }
  sale_items: SaleItem[]
  customer_id?: string
  price_list_id?: string
}

interface CustomerInfo {
  full_name: string
  current_balance: number
}

interface SaleDetailModalProps {
  open: boolean
  onClose: () => void
  saleId: string | null
}

export function SaleDetailModal({ open, onClose, saleId }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleDetail | null>(null)
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !saleId) return
    setLoading(true)
    setSale(null)
    setCustomer(null)

    api.get<SaleDetail>(`/api/sales/${saleId}`)
      .then(async data => {
        setSale(data)
        // Si tiene cliente, traer info de cuenta corriente
        if (data.customer_id) {
          try {
            const c = await api.get<CustomerInfo>(`/api/customers/${data.customer_id}`)
            setCustomer(c)
          } catch { }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, saleId])

  const handlePrint = () => {
    if (!sale) return
    const win = window.open('', '_blank', 'width=420,height=700')
    if (!win) return

    const itemsSubtotal = sale.sale_items.reduce(
      (a, i) => a + i.unit_price * i.quantity - i.discount, 0
    )
    const itemCount = sale.sale_items.reduce((a, i) => a + i.quantity, 0)

    win.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="utf-8"><title>Ticket StockOS</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Inter',sans-serif; background:#fff; color:#1a1a18; width:380px; }
      .mono { font-family:'IBM Plex Mono',monospace; }
    </style>
    </head><body>
    <div style="background:linear-gradient(135deg,#15803d 0%,#16a34a 60%,#22c55e 100%);padding:24px 20px 20px;color:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:11px;opacity:0.8;margin-bottom:2px;letter-spacing:0.05em;text-transform:uppercase">StockOS · Punto de Venta</div>
          <div style="font-size:13px;opacity:0.9">${formatDateTime(sale.created_at)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;opacity:0.7;margin-bottom:2px">Comprobante</div>
          <div style="font-family:monospace;font-size:13px;font-weight:600;letter-spacing:0.08em">#${sale.id.slice(-8).toUpperCase()}</div>
        </div>
      </div>
      <div style="margin-top:20px;text-align:center">
        <div style="font-size:11px;opacity:0.8;margin-bottom:4px;letter-spacing:0.05em;text-transform:uppercase">Total pagado</div>
        <div style="font-size:40px;font-weight:700;letter-spacing:-0.02em;line-height:1">${formatCurrency(sale.total)}</div>
      </div>
      <div style="margin-top:16px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.2);border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600">
        ${getPaymentMethodLabel(sale.payment_method)}
        ${sale.payment_method === 'credito' && sale.installments > 1 ? ` · ${sale.installments} cuotas` : ''}
        ${customer ? ` · ${customer.full_name}` : ''}
      </div>
    </div>

    <div style="background:#f5f5f4;padding:0 20px 20px">
      <div style="display:flex;gap:8px;margin-bottom:16px;padding-top:16px">
        <div style="flex:1;background:#fff;border-radius:10px;padding:10px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;font-family:monospace">${itemCount}</div>
          <div style="font-size:10px;color:#6a6a64;margin-top:1px">${itemCount === 1 ? 'producto' : 'productos'}</div>
        </div>
        ${sale.discount > 0 ? `
        <div style="flex:1;background:#fff;border-radius:10px;padding:10px 12px;text-align:center">
          <div style="font-size:18px;font-weight:700;font-family:monospace;color:#dc2626">-${formatCurrency(sale.discount)}</div>
          <div style="font-size:10px;color:#6a6a64;margin-top:1px">descuento</div>
        </div>` : ''}
      </div>

      <div style="background:#fff;border-radius:10px;overflow:hidden;margin-bottom:12px">
        <div style="padding:10px 14px;border-bottom:1px solid #e5e5e2;font-size:10px;font-weight:600;color:#6a6a64;letter-spacing:0.05em;text-transform:uppercase;display:flex;justify-content:space-between">
          <span>Detalle</span><span>Importe</span>
        </div>
        ${sale.sale_items.map((item, i) => `
        <div style="padding:10px 14px;${i < sale.sale_items.length - 1 ? 'border-bottom:1px solid #f5f5f4;' : ''}display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600">${item.products.name}</div>
            <div style="font-size:10px;color:#8a8a84;margin-top:2px">
              ${item.quantity} ${item.products.unit} × ${formatCurrency(item.unit_price)}
              ${item.discount > 0 ? `<span style="color:#dc2626"> − ${formatCurrency(item.discount)}</span>` : ''}
            </div>
          </div>
          <div style="font-size:13px;font-family:monospace;font-weight:600;flex-shrink:0">
            ${formatCurrency(item.unit_price * item.quantity - item.discount)}
          </div>
        </div>`).join('')}
      </div>

      <div style="background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:12px">
        ${sale.discount > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#6a6a64;margin-bottom:6px">
          <span>Subtotal</span><span style="font-family:monospace">${formatCurrency(itemsSubtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#dc2626;margin-bottom:8px">
          <span>Descuento</span><span style="font-family:monospace">− ${formatCurrency(sale.discount)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;${sale.discount > 0 ? 'padding-top:8px;border-top:1px dashed #e5e5e2' : ''}">
          <span>Total</span>
          <span style="font-family:monospace;color:#15803d">${formatCurrency(sale.total)}</span>
        </div>
      </div>

      <div style="text-align:center">
        <div style="font-size:12px;color:#8a8a84;margin-bottom:6px">¡Gracias por su compra!</div>
        <div style="font-size:10px;color:#b4b2a9">⚡ Powered by StockOS</div>
      </div>
    </div>
    </body></html>
  `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const itemCount = sale?.sale_items.reduce((a, i) => a + i.quantity, 0) ?? 0

  return (
    <Modal open={open} onClose={onClose} title="Detalle de venta" size="md">
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
        </div>
      ) : !sale ? null : (
        <div className="space-y-4">

          {/* Header de la venta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
              <p className="text-xs text-[var(--text3)] mb-0.5">Total</p>
              <p className="text-2xl font-bold mono text-[var(--accent)]">{formatCurrency(sale.total)}</p>
            </div>
            <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text2)]">
                <Calendar size={11} className="text-[var(--text3)]" />
                {formatDateTime(sale.created_at)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--text2)]">
                <Hash size={11} className="text-[var(--text3)]" />
                <span className="mono">{sale.id.slice(-8).toUpperCase()}</span>
              </div>
              {sale.users && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--text2)]">
                  <User size={11} className="text-[var(--text3)]" />
                  {sale.users.full_name}
                </div>
              )}
            </div>
          </div>

          {/* Método de pago + cliente */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">
              {getPaymentMethodLabel(sale.payment_method)}
              {sale.payment_method === 'credito' && sale.installments > 1 && ` · ${sale.installments} cuotas`}
            </Badge>
            {customer && (
              <Badge variant="warning">
                <CreditCard size={11} className="inline mr-1" />
                {customer.full_name} · saldo {formatCurrency(customer.current_balance)}
              </Badge>
            )}
            <Badge variant="default">
              <Package size={11} className="inline mr-1" />
              {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
            </Badge>
          </div>

          {/* Cliente */}
          {customer && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
              <div className="w-8 h-8 rounded-full bg-[var(--surface3)] flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-[var(--text3)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text)]">{customer.full_name}</p>
                <p className="text-xs text-[var(--text3)]">Cuenta corriente</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-[var(--text3)]">Saldo actual</p>
                <p className={`text-sm font-bold mono ${Number(customer.current_balance) > 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                  {formatCurrency(customer.current_balance)}
                </p>
              </div>
            </div>
          )}

          {/* Ítems */}
          <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cant.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">P. Unit.</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sale.sale_items.map(item => (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--text)]">{item.products.name}</p>
                      {item.products.barcode && (
                        <p className="text-xs mono text-[var(--text3)]">{item.products.barcode}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">
                      {item.quantity} {item.products.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-[var(--text2)]">
                      {formatCurrency(item.unit_price)}
                      {item.discount > 0 && (
                        <p className="text-xs text-[var(--danger)]">-{formatCurrency(item.discount)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right mono font-semibold text-[var(--text)]">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {sale.discount > 0 && (
                  <tr className="border-t border-[var(--border)]">
                    <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text3)]">Descuento</td>
                    <td className="px-3 py-2 text-right mono text-[var(--danger)]">− {formatCurrency(sale.discount)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-[var(--border)]">
                  <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold text-[var(--text)]">Total</td>
                  <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)]">{formatCurrency(sale.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notas */}
          {sale.notes && (
            <p className="text-sm text-[var(--text2)] italic px-1">"{sale.notes}"</p>
          )}

          {/* Acciones */}
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handlePrint}>
                <Printer size={14} /> Reimprimir ticket
              </Button>
              <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
