'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'
import { Printer, CreditCard, Package, User, Calendar, Hash, FileText, Download, Receipt, Ban } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { printFacturaA4 } from '@/lib/printFactura'
import {
  printThermal,
  buildSaleTicketHtml,
  buildInvoiceTicketHtml,
  buildInvoiceQrDataUrl,
  type TicketInvoiceData,
  type TicketBusiness,
} from '@/lib/printTicket'

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
  status?: 'completed' | 'voided' | 'partially_returned'
  refund_method?: 'cash' | 'cuenta_corriente' | 'external'
  void_reason?: string
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
  /** Se llama tras anular la venta, para refrescar la lista que abrió el modal. */
  onVoided?: () => void
}


export function SaleDetailModal({ open, onClose, saleId, orderId, autoConvert, onVoided }: SaleDetailModalProps) {
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

  // Anulación
  const [voidModal, setVoidModal] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const role = user?.role ?? 'cashier'
  const canVoid = ['owner', 'admin', 'cashier'].includes(role)
  // El cajero sólo puede anular ventas del día; owner/admin sin límite.
  const isToday = sale ? new Date(sale.created_at).toDateString() === new Date().toDateString() : false
  const withinWindow = role === 'owner' || role === 'admin' || isToday
  const isVoided = sale?.status === 'voided'

  const ivaCondition = user?.business?.iva_condition ?? ''
  // MO: solo C · RI: A y B · EX: B y C · sin configurar: todos
  const allowedConvertTypes: ('A' | 'B' | 'C')[] =
    ivaCondition === 'MO' ? ['C'] :
    ivaCondition === 'RI' ? ['A', 'B'] :
    ivaCondition === 'EX' ? ['B', 'C'] :
    ['A', 'B', 'C']

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
            setConvertType(allowedConvertTypes[0])
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
      const canConvertOrRetry = invoice?.invoice_type === 'X' ||
        (invoice && ['rejected', 'pending'].includes(invoice.afip_status) && ['A', 'B', 'C'].includes(invoice.invoice_type))
      if ((e.key === 'f' || e.key === 'F') && canConvertOrRetry) {
        e.preventDefault(); openConvertModal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, convertModal, sale, invoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const openConvertModal = () => {
    if (!invoice) return
    // Al reintentar, pre-llenar con el tipo actual del invoice si está permitido
    const currentType = invoice.invoice_type as 'A' | 'B' | 'C'
    const defaultType = allowedConvertTypes.includes(currentType) ? currentType : allowedConvertTypes[0]
    setConvertType(defaultType)
    setReceptorName(invoice.receptor_name ?? customer?.full_name ?? '')
    setReceptorCuit(invoice.receptor_cuit ?? '')
    setReceptorAddress(invoice.receptor_address ?? '')
    setReceptorIva(invoice.receptor_iva_condition ?? 'CF')
    setConvertModal(true)
  }

  const handlePrint = async () => {
    if (!sale) return
    const biz: TicketBusiness = user?.business ?? {}
    const isInvoiced = !!(invoice && invoice.afip_status === 'authorized' && (invoice.cae || invoice.afip_cae))

    if (isInvoiced && invoice) {
      const cae = invoice.afip_cae ?? invoice.cae
      const qrDataUrl = await buildInvoiceQrDataUrl({ ...invoice, cae }, biz)
      const data: TicketInvoiceData = {
        invoice_type: invoice.invoice_type,
        numero: invoice.numero,
        created_at: sale.created_at,
        cae,
        cae_vto: invoice.afip_cae_vto,
        receptor_name: invoice.receptor_name ?? customer?.full_name,
        receptor_cuit: invoice.receptor_cuit,
        receptor_address: invoice.receptor_address,
        receptor_iva_condition: invoice.receptor_iva_condition,
        net_amount: invoice.net_amount,
        iva_amount: invoice.iva_amount,
        total_amount: invoice.total_amount,
        items: invoice.invoice_items.map(i => ({
          description: i.description, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal,
        })),
        qrDataUrl,
        payment_method: sale.payment_method,
        installments: sale.installments,
        payment_splits: sale.payment_splits,
      }
      const ptoVenta = String(biz.afip_punto_venta ?? 1).padStart(5, '0')
      printThermal(`Factura ${ptoVenta}-${String(invoice.numero).padStart(8, '0')}`, buildInvoiceTicketHtml(data, biz))
      return
    }

    printThermal(`Ticket #${sale.id.slice(-8).toUpperCase()}`, buildSaleTicketHtml({
      id: sale.id,
      created_at: sale.created_at,
      total: sale.total,
      discount: sale.discount,
      shipping_amount: sale.shipping_amount,
      payment_method: sale.payment_method,
      installments: sale.installments,
      payment_splits: sale.payment_splits,
      items: sale.sale_items.map(i => ({
        name: i.products.name, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount,
      })),
      sellerName: sale.users?.full_name,
      customerName: customer?.full_name,
    }, biz))
  }


  const handleDownloadInvoice = () => {
    if (!invoice) return
    printFacturaA4(invoice, user?.business ?? undefined, customer?.full_name)
      .catch(err => toast.error(err instanceof Error ? err.message : 'No se pudo descargar la factura'))
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

  const handleVoid = async () => {
    if (!sale) return
    if (!voidReason.trim()) { toast.error('Ingresá el motivo de la anulación'); return }
    setVoiding(true)
    try {
      const res = await api.post<{ refund_method: string; suggest_credit_note: boolean }>(
        `/api/sales/${sale.id}/void`,
        { reason: voidReason.trim() },
      )
      const refundMsg =
        res.refund_method === 'cash' ? 'Se registró el egreso de caja.' :
        res.refund_method === 'cuenta_corriente' ? 'Se descontó de la cuenta corriente del cliente.' :
        'El reintegro del medio de pago se gestiona por fuera.'
      toast.success(`Venta anulada. ${refundMsg}`)
      if (res.suggest_credit_note) {
        toast.warning('Esta venta tiene factura: emití la Nota de Crédito desde Comprobantes.', { duration: 8000 })
      }
      setVoidModal(false)
      setVoidReason('')
      onVoided?.()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anular la venta')
    } finally { setVoiding(false) }
  }

  const itemCount = sale?.sale_items.reduce((a, i) => a + i.quantity, 0) ?? 0

  return (
    <>
      <Modal open={open && !convertModal && !voidModal} onClose={onClose} title="Detalle de venta" size="md">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : !sale ? null : (
          <div className="space-y-4">

            {/* Banner de venta anulada */}
            {isVoided && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--danger-subtle)] border border-[var(--danger)]/30">
                <Ban size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-[var(--danger)]">Venta anulada</p>
                  {sale.void_reason && <p className="text-[var(--text2)] mt-0.5">Motivo: {sale.void_reason}</p>}
                  {sale.refund_method && (
                    <p className="text-[var(--text3)] mt-0.5">
                      Reintegro: {sale.refund_method === 'cash' ? 'egreso de caja'
                        : sale.refund_method === 'cuenta_corriente' ? 'descontado de cuenta corriente'
                        : 'gestionado por fuera (tarjeta/transferencia)'}
                    </p>
                  )}
                </div>
              </div>
            )}

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

            {/* Acciones — destructiva a la izquierda, principales a la derecha */}
            <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  {canVoid && withinWindow && !isVoided && (
                    <Button variant="ghost" onClick={() => { setVoidReason(''); setVoidModal(true) }}
                      className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]">
                      <Ban size={14} />
                      Anular venta
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="secondary" onClick={handlePrint}>
                    <Printer size={14} />
                    Reimprimir
                    <kbd className="ml-1 text-[10px] bg-[var(--surface3)] px-1.5 py-0.5 rounded font-sans">P</kbd>
                  </Button>
                  {invoice && invoice.invoice_type === 'X' && (
                    <Button onClick={openConvertModal}>
                      <Receipt size={15} />
                      Facturar
                      <kbd className="ml-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-sans">F</kbd>
                    </Button>
                  )}
                  {invoice && invoice.invoice_type !== 'X' && (invoice.afip_status === 'pending' || invoice.afip_status === 'rejected') && (
                    <Button variant="secondary" onClick={openConvertModal}>
                      <Receipt size={15} />
                      Reintentar ARCA
                    </Button>
                  )}
                </div>
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

      {/* Modal anular venta */}
      <Modal open={voidModal} onClose={() => !voiding && setVoidModal(false)} title="Anular venta" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--danger-subtle)] border border-[var(--danger)]/30">
            <Ban size={15} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--text2)]">
              Se repondrá el stock de los productos y se reintegrará el importe según el medio de pago:
              {sale?.payment_method === 'efectivo' && ' egreso de la caja abierta.'}
              {sale?.payment_method === 'cuenta_corriente' && ' se descontará de la cuenta corriente del cliente.'}
              {sale && !['efectivo', 'cuenta_corriente'].includes(sale.payment_method) && ' el reverso del cobro se gestiona por fuera (tarjeta/transferencia).'}
              {' '}Esta acción no se puede deshacer.
            </p>
          </div>

          <Input
            label="Motivo *"
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            placeholder="Ej: producto equivocado, error de carga…"
            autoFocus
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setVoidModal(false)} disabled={voiding}>Cancelar</Button>
            <Button variant="danger" onClick={handleVoid} loading={voiding} disabled={!voidReason.trim()}>
              <Ban size={14} />
              Anular venta
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
