'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, CreditCard, Package, User, Calendar, Hash, FileText, Download, Receipt } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { printFacturaA4 } from '@/lib/printFactura'

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
  shipping_amount?: number
  payment_method: string
  installments: number
  payment_splits?: Array<{ method: string; amount: number; installments?: number }>
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
  afip_cae?: string
  afip_cae_vto?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition: string
  notes?: string
  invoice_items: { id: string; description: string; quantity: number; unit_price: number; iva_rate?: number; subtotal: number }[]
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

interface SaleDetailModalProps {
  open: boolean
  onClose: () => void
  saleId: string | null
  orderId?: string
  autoConvert?: boolean
}


export function SaleDetailModal({ open, onClose, saleId, orderId, autoConvert }: SaleDetailModalProps) {
  const [sale, setSale] = useState<SaleDetail | null>(null)
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingInvoice, setLoadingInvoice] = useState(false)
  const { user } = useAuth()

  // Convert modal state
  const [convertModal, setConvertModal] = useState(false)
  const [convertType, setConvertType] = useState<'A' | 'B' | 'C'>('B')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorName, setReceptorName] = useState('')
  const [receptorAddress, setReceptorAddress] = useState('')
  const [receptorIva, setReceptorIva] = useState('CF')
  const [converting, setConverting] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)

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
          if (autoConvert && inv?.invoice_type === 'X') {
            setConvertType('B')
            setReceptorName(inv.receptor_name ?? '')
            setReceptorCuit(inv.receptor_cuit ?? '')
            setReceptorAddress(inv.receptor_address ?? '')
            setReceptorIva(inv.receptor_iva_condition ?? 'CF')
            setConvertModal(true)
          }
        } catch { }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [open, saleId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!saleId) return
    setLoadingInvoice(true)
    api.get(`/api/invoices/sale/${saleId}`)
      .then((data: unknown) => setInvoice(data as InvoiceSummary | null))
      .catch(() => { })
      .finally(() => setLoadingInvoice(false))
  }, [saleId])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || convertModal) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); handlePrint() }
      if ((e.key === 'f' || e.key === 'F') && invoice?.invoice_type === 'X') {
        e.preventDefault(); openConvertModal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, convertModal, sale, invoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const openConvertModal = () => {
    if (!invoice) return
    setConvertType('B')
    setReceptorName(invoice.receptor_name ?? customer?.full_name ?? '')
    setReceptorCuit(invoice.receptor_cuit ?? '')
    setReceptorAddress(invoice.receptor_address ?? '')
    setReceptorIva(invoice.receptor_iva_condition ?? 'CF')
    setConvertModal(true)
  }

  const handlePrint = () => {
    if (!sale) return
    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    const itemsSubtotal = sale.sale_items.reduce(
      (a, i) => a + i.unit_price * i.quantity - i.discount, 0
    )
    const isInvoiced = !!(invoice && invoice.afip_status === 'authorized' && (invoice.cae || invoice.afip_cae))
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
          <div style="font-size:11px;color:#555;">
            &nbsp;&nbsp;c/u ${formatCurrency(item.unit_price)}${item.discount > 0 ? ` &minus; dto ${formatCurrency(item.discount)}` : ''}
          </div>
        </div>`
    }).join('')

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Ticket</title>
      <style>
        @page { size: 80mm auto; margin: 3mm 2mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 500; line-height: 1.4; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style>
    </head><body>
      <div style="padding:14px 12px;">
        <div style="text-align:center;margin-bottom:2px;">
          <div style="font-size:15px;font-weight:bold;letter-spacing:0.04em;">${user?.business?.name ?? 'StockOS'}</div>
          ${user?.business?.cuit ? `<div>CUIT: ${user.business.cuit}</div>` : ''}
          ${user?.business?.address ? `<div style="font-size:11px;margin-top:1px;">${user.business.address}</div>` : ''}
          ${user?.business?.phone ? `<div style="font-size:11px;">Tel: ${user.business.phone}</div>` : ''}
        </div>
        ${sep}
        <div style="font-size:12px;line-height:1.5;">
          <div>Fecha: ${formatDateTime(sale.created_at)}</div>
          <div>N&#176; Ticket: #${sale.id.slice(-8).toUpperCase()}</div>
          ${sale.users ? `<div>Cajero: ${sale.users.full_name}</div>` : ''}
          ${customer ? `<div>Cliente: ${customer.full_name}</div>` : ''}
        </div>
        ${sep}
        <div style="display:flex;justify-content:space-between;align-items:flex-start;font-weight:bold;font-size:11px;margin-bottom:6px;">
          <span>DESCRIPCIÓN</span><span>IMPORTE</span>
        </div>
        ${itemsHtml}
        ${sep}
        <div style="line-height:1.6;">
          ${(sale.discount > 0 || (sale.shipping_amount ?? 0) > 0) ? `
          <div style="display:flex;justify-content:space-between;">
            <span>Subtotal</span><span>${formatCurrency(itemsSubtotal)}</span>
          </div>` : ''}
          ${sale.discount > 0 ? `
          <div style="display:flex;justify-content:space-between;">
            <span>Descuento</span><span>-${formatCurrency(sale.discount)}</span>
          </div>` : ''}
          ${(sale.shipping_amount ?? 0) > 0 ? `
          <div style="display:flex;justify-content:space-between;">
            <span>Envío</span><span>+${formatCurrency(sale.shipping_amount!)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:2px;">
            <span>TOTAL</span><span>${formatCurrency(sale.total)}</span>
          </div>
          ${sale.payment_splits && sale.payment_splits.length > 1
            ? sale.payment_splits.map(s =>
                `<div style="font-size:11px;">${getPaymentMethodLabel(s.method)}: ${formatCurrency(s.amount)}${s.method === 'credito' && (s.installments ?? 1) > 1 ? ` (${s.installments} cuotas)` : ''}</div>`
              ).join('')
            : `<div style="margin-top:4px;font-size:11px;">Pago: ${getPaymentMethodLabel(sale.payment_method)}${sale.payment_method === 'credito' && sale.installments > 1 ? ` (${sale.installments} cuotas)` : ''}</div>`
          }
        </div>
        ${sep}
        ${isInvoiced && invoice ? `
        <div style="text-align:center;line-height:1.6;">
          <div style="font-weight:bold;font-size:12px;">${invoiceTypeLabel(invoice.invoice_type)}</div>
          ${invoice.numero !== undefined ? `<div>N&#176;: ${String(invoice.numero).padStart(8, '0')}</div>` : ''}
          <div>CAE: ${invoice.cae ?? invoice.afip_cae}</div>
          ${invoice.afip_cae_vto ? `<div>Vto. CAE: ${invoice.afip_cae_vto}</div>` : ''}
        </div>` : `
        <div style="text-align:center;font-weight:bold;padding:2px 0;letter-spacing:0.03em;">*** NO VALIDO COMO FACTURA ***</div>`}
        ${sep}
        <div style="text-align:center;font-size:11px;line-height:1.6;">
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
    printFacturaA4(invoice, user?.business ?? undefined, customer?.full_name)
  }

  const handleAuthorize = async () => {
    if (!invoice) return
    setAuthorizing(true)
    try {
      const authorized = await api.post<InvoiceSummary>(`/api/invoices/${invoice.id}/authorize`, {})
      toast.success(`CAE obtenido: ${authorized.afip_cae ?? authorized.cae}`)
      setInvoice({ ...authorized, invoice_items: authorized.invoice_items ?? invoice.invoice_items })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al autorizar en ARCA')
    } finally { setAuthorizing(false) }
  }

  const handleConvert = async () => {
    if (!invoice) return
    if (convertType === 'A' && !receptorCuit) {
      toast.error('El CUIT del receptor es obligatorio para Factura A')
      return
    }
    setConverting(true)
    try {
      const converted = await api.post<InvoiceSummary>('/api/invoices/convert', {
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
        const authorized = await api.post<InvoiceSummary>(`/api/invoices/${converted.id}/authorize`, {})
        toast.success(`Factura ${convertType} autorizada — CAE: ${authorized.afip_cae ?? authorized.cae}`, { id: 'afip-auth' })
        const merged = { ...authorized, invoice_items: authorized.invoice_items ?? converted.invoice_items }
        setInvoice(merged)
        await printFacturaA4(merged, user?.business ?? undefined, customer?.full_name)
      } catch (afipErr: unknown) {
        toast.error(afipErr instanceof Error ? afipErr.message : 'Error al autorizar en ARCA', { id: 'afip-auth' })
        setInvoice(converted)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    } finally { setConverting(false) }
  }

  const itemCount = sale?.sale_items.reduce((a, i) => a + i.quantity, 0) ?? 0

  return (
    <>
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
                {orderId && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text2)]">
                    <Receipt size={11} className="text-[var(--text3)]" />
                    <span className="text-[var(--text3)]">N° Remito:</span>
                    <span className="mono font-semibold">{orderId.slice(0, 8).toUpperCase()}</span>
                  </div>
                )}
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
              {sale.payment_splits && sale.payment_splits.length > 1 ? (
                sale.payment_splits.map((s, i) => (
                  <Badge key={i} variant="default">
                    {getPaymentMethodLabel(s.method)} {formatCurrency(s.amount)}
                    {s.method === 'credito' && (s.installments ?? 1) > 1 && ` · ${s.installments} cuotas`}
                  </Badge>
                ))
              ) : (
                <Badge variant="default">
                  {getPaymentMethodLabel(sale.payment_method)}
                  {sale.payment_method === 'credito' && sale.installments > 1 && ` · ${sale.installments} cuotas`}
                </Badge>
              )}
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
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
                  {(sale.shipping_amount ?? 0) > 0 && (
                    <tr className="border-t border-[var(--border)]">
                      <td colSpan={3} className="px-3 py-2 text-sm text-[var(--text3)]">Envío</td>
                      <td className="px-3 py-2 text-right mono text-[var(--text2)]">+ {formatCurrency(sale.shipping_amount!)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-[var(--border)]">
                    <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold text-[var(--text)]">Total</td>
                    <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)]">{formatCurrency(sale.total)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
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
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="secondary" onClick={handlePrint}>
                  <Printer size={14} />
                  Reimprimir ticket
                  <kbd className="ml-1 text-[10px] bg-[var(--surface3)] px-1.5 py-0.5 rounded font-sans">P</kbd>
                </Button>
                {invoice && invoice.invoice_type === 'X' && (
                  <Button variant="secondary" onClick={openConvertModal}>
                    <Receipt size={15} />
                    Facturar
                    <kbd className="ml-1 text-[10px] bg-[var(--surface3)] px-1.5 py-0.5 rounded font-sans">F</kbd>
                  </Button>
                )}
                {invoice && invoice.invoice_type !== 'X' && (invoice.afip_status === 'pending' || invoice.afip_status === 'rejected') && (
                  <Button variant="secondary" onClick={handleAuthorize} disabled={authorizing}>
                    <Receipt size={15} />
                    {authorizing ? 'Autorizando...' : 'Reintentar ARCA'}
                  </Button>
                )}
                <Button variant="secondary" onClick={onClose}>Cerrar</Button>
              </div>
            </div>

          </div>
        )}
      </Modal>

      {/* Modal convertir a factura (inline, sin navegar) */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="Convertir a factura" size="sm">
        <div className="space-y-4">

          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Ticket X #{String(invoice?.numero ?? 0).padStart(8, '0')} · {formatCurrency(invoice?.total_amount ?? 0)}
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

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConvertModal(false)} disabled={converting}>Cancelar</Button>
              <Button onClick={handleConvert} loading={converting}>
                Generar Factura {convertType}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
