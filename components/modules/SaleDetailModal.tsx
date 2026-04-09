'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, CreditCard, Package, User, Calendar, Hash, FileText, Download, Receipt } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'


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

interface InvoiceSummary {
  id: string
  invoice_type: string
  numero: number
  fecha: string
  total_amount: number
  net_amount: number
  iva_amount: number
  afip_status: string
  cae?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_iva_condition: string
  notes?: string
  invoice_items: { id: string; description: string; quantity: number; unit_price: number; subtotal: number }[]
}

const TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
  NCA: 'NC A', NCB: 'NC B', NCC: 'NC C',
  NDA: 'ND A', NDB: 'ND B', NDC: 'ND C',
}

interface SaleDetailModalProps {
  open: boolean
  onClose: () => void
  saleId: string | null
}

export function SaleDetailModal({ open, onClose, saleId }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleDetail | null>(null)
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [invoice, setInvoice] = useState<{
    id: string
    invoice_type: string
    numero: number
    fecha?: string
    receptor_name?: string
    receptor_cuit?: string
    receptor_address?: string
    receptor_iva_condition?: string
    net_amount?: number
    iva_amount?: number
    total_amount?: number
    afip_status?: string
    cae?: string
    cae_expiry?: string
    notes?: string
    invoice_items?: {
      id: string
      description: string
      quantity: number
      unit_price: number
      iva_rate?: number  // ← opcional
      subtotal: number
    }[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingInvoice, setLoadingInvoice] = useState(false)
  const router = useRouter()
  const { user } = useAuth()

  useEffect(() => {
    if (!open || !saleId) return
    setLoading(true)
    setSale(null)
    setCustomer(null)
    setInvoice(null)

    api.get<SaleDetail>(`/api/sales/${saleId}`)
      .then(async data => {
        setSale(data)
        if (data.customer_id) {
          try {
            const c = await api.get<CustomerInfo>(`/api/customers/${data.customer_id}`)
            setCustomer(c)
          } catch { }
        }
        try {
          const inv = await api.get<InvoiceSummary | null>(`/api/invoices/sale/${saleId}`)
          setInvoice(inv)
        } catch { }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, saleId])

  // Cargar el comprobante cuando se abre el modal
  useEffect(() => {
    if (!saleId) return
    setLoadingInvoice(true)
    api.get(`/api/invoices/sale/${saleId}`)
      .then((data: unknown) => setInvoice(data as { id: string; invoice_type: string; numero: number } | null))
      .catch(() => { })
      .finally(() => setLoadingInvoice(false))
  }, [saleId])

  const handlePrint = () => {
    if (!sale) return
    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    const itemsSubtotal = sale.sale_items.reduce(
      (a, i) => a + i.unit_price * i.quantity - i.discount, 0
    )
    const isInvoiced = !!(invoice && invoice.afip_status === 'authorized' && invoice.cae)
    const invoiceTypeLabel = (type: string) => {
      const map: Record<string, string> = {
        A: 'FACTURA A', B: 'FACTURA B', C: 'FACTURA C',
        NCA: 'NOTA DE CRÉDITO A', NCB: 'NOTA DE CRÉDITO B', NCC: 'NOTA DE CRÉDITO C',
        R: 'REMITO',
      }
      return map[type] ?? `COMPROBANTE ${type}`
    }

    const sep = `<div style="border-top:1px dashed #999;margin:8px 0;"></div>`
    const itemsHtml = sale.sale_items.map(item => {
      const lineTotal = item.unit_price * item.quantity - item.discount
      return `
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <span style="flex:1;padding-right:8px;word-break:break-word;">${item.quantity} ${item.products.unit} ${item.products.name}</span>
            <span style="flex-shrink:0;">${formatCurrency(lineTotal)}</span>
          </div>
          <div style="font-size:10px;color:#555;">
            &nbsp;&nbsp;c/u ${formatCurrency(item.unit_price)}${item.discount > 0 ? ` &minus; dto ${formatCurrency(item.discount)}` : ''}
          </div>
        </div>`
    }).join('')

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Ticket</title>
      <style>
        @page { size: 80mm auto; margin: 3mm 2mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; background: #fff; }
      </style>
    </head><body>
      <div style="padding:14px 12px;">
        <div style="text-align:center;margin-bottom:2px;">
          <div style="font-size:15px;font-weight:bold;letter-spacing:0.04em;">${user?.business?.name ?? 'StockOS'}</div>
          ${user?.business?.cuit ? `<div>CUIT: ${user.business.cuit}</div>` : ''}
          ${user?.business?.address ? `<div style="font-size:10px;margin-top:1px;">${user.business.address}</div>` : ''}
          ${user?.business?.phone ? `<div style="font-size:10px;">Tel: ${user.business.phone}</div>` : ''}
        </div>
        ${sep}
        <div style="font-size:11px;line-height:1.5;">
          <div>Fecha: ${formatDateTime(sale.created_at)}</div>
          <div>N&#176; Ticket: #${sale.id.slice(-8).toUpperCase()}</div>
          ${sale.users ? `<div>Cajero: ${sale.users.full_name}</div>` : ''}
          ${customer ? `<div>Cliente: ${customer.full_name}</div>` : ''}
        </div>
        ${sep}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;font-weight:bold;font-size:10px;margin-bottom:6px;">
          <span>DESCRIPCIÓN</span><span>IMPORTE</span>
        </div>
        ${itemsHtml}
        ${sep}
        <div style="line-height:1.6;">
          ${sale.discount > 0 ? `
          <div style="display:flex;justify-content:space-between;">
            <span>Subtotal</span><span>${formatCurrency(itemsSubtotal)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span>Descuento</span><span>-${formatCurrency(sale.discount)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:2px;">
            <span>TOTAL</span><span>${formatCurrency(sale.total)}</span>
          </div>
          <div style="margin-top:4px;font-size:11px;">
            Pago: ${getPaymentMethodLabel(sale.payment_method)}${sale.payment_method === 'credito' && sale.installments > 1 ? ` (${sale.installments} cuotas)` : ''}
          </div>
        </div>
        ${sep}
        ${isInvoiced && invoice ? `
        <div style="text-align:center;line-height:1.6;">
          <div style="font-weight:bold;font-size:12px;">${invoiceTypeLabel(invoice.invoice_type)}</div>
          ${invoice.numero !== undefined ? `<div>N&#176;: ${String(invoice.numero).padStart(8, '0')}</div>` : ''}
          <div>CAE: ${invoice.cae}</div>
          ${invoice.cae_expiry ? `<div>Vto. CAE: ${invoice.cae_expiry}</div>` : ''}
        </div>` : `
        <div style="text-align:center;font-weight:bold;padding:2px 0;letter-spacing:0.03em;">*** NO VALIDO COMO FACTURA ***</div>`}
        ${sep}
        <div style="text-align:center;font-size:10px;line-height:1.6;">
          <div>&#161;Gracias por su compra!</div>
          <div style="color:#888;">Powered by StockOS</div>
        </div>
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const handleDownloadInvoice = () => {
    if (!invoice) return
    const win = window.open('', '_blank', 'width=520,height=800')
    if (!win) return

    const typeLabel = TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type
    const numero = String(invoice.numero).padStart(8, '0')
    const isA = invoice.invoice_type === 'A'

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${typeLabel} #${numero}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',Arial,sans-serif; background:#fff; color:#1a1a18; padding:32px; max-width:480px; margin:0 auto; }
        .mono { font-family:'Courier New',monospace; }
        h1 { font-size:22px; font-weight:700; margin-bottom:4px; }
        .sub { font-size:12px; color:#6a6a64; margin-bottom:24px; }
        .section { margin-bottom:20px; }
        .label { font-size:10px; color:#8a8a84; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
        .divider { border:none; border-top:1px dashed #d4d4cc; margin:16px 0; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { text-align:left; padding:6px 0; font-size:10px; color:#8a8a84; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid #e5e5e2; }
        td { padding:8px 0; border-bottom:1px solid #f5f5f4; vertical-align:top; }
        td.right { text-align:right; font-family:'Courier New',monospace; }
        .total-row td { font-size:15px; font-weight:700; border-bottom:none; padding-top:12px; }
        .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
        .badge-ok { background:#dcfce7; color:#15803d; }
        .badge-pending { background:#fef9c3; color:#a16207; }
        .badge-rej { background:#fee2e2; color:#dc2626; }
        @media print { body { padding:16px; } }
      </style>
    </head><body>
      <div class="section">
        <div class="label">Comprobante</div>
        <h1>${typeLabel}</h1>
        <div class="sub">N° ${numero} · ${invoice.fecha}</div>
      </div>

      <div class="section">
        <div class="label">Receptor</div>
        <div style="font-size:14px;font-weight:600">${invoice.receptor_name ?? 'Consumidor Final'}</div>
        ${invoice.receptor_cuit ? `<div class="mono" style="font-size:12px;color:#6a6a64">CUIT: ${invoice.receptor_cuit}</div>` : ''}
        <div style="font-size:12px;color:#6a6a64">Condición IVA: ${invoice.receptor_iva_condition}</div>
      </div>

      <hr class="divider">

      <table>
        <thead><tr>
          <th style="width:50%">Descripción</th>
          <th class="right">Cant.</th>
          <th class="right">P. Unit.</th>
          <th class="right">Subtotal</th>
        </tr></thead>
        <tbody>
          ${(invoice.invoice_items ?? []).map(item => `<tr>
            <td>${item.description}</td>
            <td class="right">${item.quantity}</td>
            <td class="right">${formatCurrency(item.unit_price)}</td>
            <td class="right">${formatCurrency(item.subtotal)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          ${isA ? `
          <tr><td colspan="3" style="color:#6a6a64;font-size:12px">Neto gravado</td><td class="right" style="font-size:12px">${formatCurrency(invoice.net_amount ?? 0)}</td></tr>
          <tr><td colspan="3" style="color:#6a6a64;font-size:12px">IVA 21%</td><td class="right" style="font-size:12px">${formatCurrency(invoice.iva_amount ?? 0)}</td></tr>
          ` : ''}
          <tr class="total-row">
            <td colspan="3">Total</td>
            <td class="right" style="color:#15803d">${formatCurrency(invoice.total_amount ?? 0)}</td>
          </tr>
        </tfoot>
      </table>

      ${invoice.cae ? `<hr class="divider">
      <div class="section">
        <div class="label">AFIP</div>
        <div class="mono" style="font-size:12px">CAE: ${invoice.cae}</div>
      </div>` : ''}

      ${invoice.notes ? `<hr class="divider"><div style="font-size:12px;color:#6a6a64;font-style:italic">${invoice.notes}</div>` : ''}
    </body></html>`)
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
                <span className="text-[var(--text3)]">N° Ticket:</span>
                <span className="mono font-semibold">#{sale.id.slice(-8).toUpperCase()}</span>
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

          {/* Comprobante asociado */}
          {invoice && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-[var(--text3)]" />
                <div>
                  <p className="text-xs font-medium text-[var(--text)]">
                    {TYPE_LABELS[invoice.invoice_type]} #{String(invoice.numero).padStart(8, '0')}
                  </p>
                  <p className="text-xs text-[var(--text3)]">{formatCurrency(invoice.total_amount ?? 0)}</p>
                </div>
              </div>
              <button
                onClick={handleDownloadInvoice}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                <Download size={13} /> Descargar
              </button>
            </div>
          )}

          {/* Acciones */}
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handlePrint}>
                <Printer size={14} /> Reimprimir ticket
              </Button>
              {invoice && invoice.invoice_type === 'X' && (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/invoices?facturar=${invoice.id}`)}
                >
                  <Receipt size={15} /> Facturar
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>Cerrar</Button>
            </div>
          </div>

        </div>
      )}
    </Modal>
  )
}
