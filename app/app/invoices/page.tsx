'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Pagination as PaginationType } from '@/types'
import { FileText, CheckCircle, Clock, XCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface InvoiceItem {
  id:          string
  description: string
  quantity:    number
  unit_price:  number
  iva_rate:    number
  subtotal:    number
}

interface Invoice {
  id:                     string
  invoice_type:           'X' | 'A' | 'B' | 'C' | 'R'
  numero:                 number
  fecha:                  string
  sale_id?:               string
  customer_id?:           string
  receptor_name?:         string
  receptor_cuit?:         string
  receptor_address?:      string
  receptor_iva_condition: string
  net_amount:             number
  iva_amount:             number
  total_amount:           number
  cae?:                   string
  cae_expiry?:            string
  afip_status:            'pending' | 'authorized' | 'rejected' | 'not_requested'
  afip_error?:            string
  afip_requested:         boolean
  notes?:                 string
  created_at:             string
  invoice_items:          InvoiceItem[]
  sales?:                 { payment_method: string }
  users?:                 { full_name: string }
  branches?:              { name: string }
  registers?:             { name: string }
  customers?:             { full_name: string; document?: string }
}

const TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
}

const TYPE_VARIANTS: Record<string, string> = {
  X: 'default', A: 'danger', B: 'success', C: 'warning', R: 'default',
}

const AFIP_LABELS: Record<string, string> = {
  not_requested: 'Sin AFIP',
  pending:       'Pendiente',
  authorized:    'Autorizado',
  rejected:      'Rechazado',
}

const AFIP_VARIANTS: Record<string, string> = {
  not_requested: 'default',
  pending:       'warning',
  authorized:    'success',
  rejected:      'danger',
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', qr: 'QR', cuenta_corriente: 'Cta. Cte.',
}

type TypeFilter = '' | 'X' | 'A' | 'B' | 'C' | 'R'

export default function InvoicesPage() {
  const [data, setData]             = useState<Invoice[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [from, setFrom]             = useState('')
  const [to, setTo]                 = useState('')

  // Refs para evitar loops
  const typeRef = useRef(typeFilter)
  const fromRef = useRef(from)
  const toRef   = useRef(to)
  const pageRef = useRef(page)
  useEffect(() => { typeRef.current = typeFilter }, [typeFilter])
  useEffect(() => { fromRef.current = from }, [from])
  useEffect(() => { toRef.current   = to },   [to])
  useEffect(() => { pageRef.current = page }, [page])

  // Detail modal
  const [detailModal, setDetailModal]   = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // Convert modal
  const [convertModal, setConvertModal] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Invoice | null>(null)
  const [convertType, setConvertType]   = useState<'A' | 'B' | 'C'>('B')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorName, setReceptorName] = useState('')
  const [receptorAddress, setReceptorAddress] = useState('')
  const [receptorIva, setReceptorIva]   = useState('CF')
  const [converting, setConverting]     = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        page:  pageRef.current,
        limit: 20,
      }
      if (typeRef.current) params.invoice_type = typeRef.current
      if (fromRef.current) params.from         = fromRef.current
      if (toRef.current)   params.to           = toRef.current

      const res = await api.get<{ data: Invoice[]; pagination: PaginationType }>('/api/invoices', params)
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchInvoices() }, [typeFilter, from, to, page, fetchInvoices])
  useEffect(() => { setPage(1) }, [typeFilter, from, to])

  const openConvert = (invoice: Invoice) => {
    setConvertTarget(invoice)
    setConvertType('B')
    setReceptorCuit('')
    setReceptorName('')
    setReceptorAddress('')
    setReceptorIva('CF')
    setConvertModal(true)
  }

  const handleConvert = async () => {
    if (!convertTarget) return
    if (convertType === 'A' && !receptorCuit) {
      toast.error('El CUIT del receptor es obligatorio para Factura A')
      return
    }
    setConverting(true)
    try {
      await api.post('/api/invoices/convert', {
        invoice_id:             convertTarget.id,
        invoice_type:           convertType,
        receptor_cuit:          receptorCuit  || null,
        receptor_name:          receptorName  || null,
        receptor_address:       receptorAddress || null,
        receptor_iva_condition: receptorIva,
      })
      toast.success(`Ticket X convertido a Factura ${convertType}`)
      setConvertModal(false)
      fetchInvoices()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    } finally { setConverting(false) }
  }

  return (
    <AppShell>
      <PageHeader
        title="Comprobantes"
        description={`${pagination.total} comprobantes`}
        action={
          <Button variant="secondary" onClick={fetchInvoices}>
            <RefreshCw size={15} /> Actualizar
          </Button>
        }
      />

      <div className="p-5 space-y-4">

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Tipo */}
          <div className="flex gap-1.5">
            {(['', 'X', 'A', 'B', 'C', 'R'] as TypeFilter[]).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
                {t === '' ? 'Todos' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Fechas */}
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text3)]">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState icon={FileText} title="Sin comprobantes"
            description="Los comprobantes se generan automáticamente al confirmar ventas en el POS." />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Comprobante</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Receptor</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">AFIP</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.map(inv => (
                  <tr key={inv.id}
                    onClick={() => { setSelectedInvoice(inv); setDetailModal(true) }}
                    className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={TYPE_VARIANTS[inv.invoice_type] as 'default' | 'success' | 'warning' | 'danger'}>
                          {inv.invoice_type}
                        </Badge>
                        <span className="mono text-xs text-[var(--text3)]">
                          #{String(inv.numero).padStart(8, '0')}
                        </span>
                      </div>
                      {(inv.branches as { name: string } | undefined)?.name && (
                        <p className="text-xs text-[var(--text3)] mt-0.5">
                          {(inv.branches as { name: string }).name}
                          {(inv.registers as { name: string } | undefined)?.name &&
                            ` · ${(inv.registers as { name: string }).name}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text2)] hidden md:table-cell">
                      {inv.fecha}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-[var(--text)]">
                        {inv.receptor_name ?? (inv.customers as { full_name: string } | undefined)?.full_name ?? 'Consumidor Final'}
                      </p>
                      {inv.receptor_cuit && (
                        <p className="text-xs text-[var(--text3)] mono">{inv.receptor_cuit}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <Badge variant={AFIP_VARIANTS[inv.afip_status] as 'default' | 'success' | 'warning' | 'danger'}>
                        {AFIP_LABELS[inv.afip_status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {inv.invoice_type === 'X' && (
                        <button onClick={() => openConvert(inv)}
                          className="text-xs text-[var(--accent)] hover:underline font-medium">
                          Facturar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination pagination={pagination} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* ── Modal detalle ── */}
      <Modal open={detailModal} onClose={() => { setDetailModal(false); setSelectedInvoice(null) }}
        title="Detalle del comprobante" size="md">
        {selectedInvoice && (
          <div className="space-y-4 pb-4">

            {/* Header */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Tipo</p>
                <div className="flex items-center gap-2">
                  <Badge variant={TYPE_VARIANTS[selectedInvoice.invoice_type] as 'default' | 'success' | 'warning' | 'danger'}>
                    {selectedInvoice.invoice_type}
                  </Badge>
                  <span className="text-sm font-medium text-[var(--text)]">
                    {TYPE_LABELS[selectedInvoice.invoice_type]}
                  </span>
                </div>
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Número</p>
                <p className="text-sm font-bold mono text-[var(--text)]">
                  #{String(selectedInvoice.numero).padStart(8, '0')}
                </p>
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Fecha</p>
                <p className="text-sm text-[var(--text)]">{selectedInvoice.fecha}</p>
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Método de pago</p>
                <p className="text-sm text-[var(--text)]">
                  {PAYMENT_LABELS[(selectedInvoice.sales as { payment_method: string } | undefined)?.payment_method ?? ''] ?? '—'}
                </p>
              </div>
            </div>

            {/* Receptor */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
              <p className="text-xs font-medium text-[var(--text3)] mb-2">Receptor</p>
              <p className="text-sm font-medium text-[var(--text)]">
                {selectedInvoice.receptor_name ?? 'Consumidor Final'}
              </p>
              {selectedInvoice.receptor_cuit && (
                <p className="text-xs text-[var(--text3)] mono mt-0.5">CUIT: {selectedInvoice.receptor_cuit}</p>
              )}
              {selectedInvoice.receptor_address && (
                <p className="text-xs text-[var(--text3)] mt-0.5">{selectedInvoice.receptor_address}</p>
              )}
              <p className="text-xs text-[var(--text3)] mt-0.5">
                Condición IVA: {selectedInvoice.receptor_iva_condition}
              </p>
            </div>

            {/* Items */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text3)]">Detalle</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2 font-medium text-[var(--text3)]">Descripción</th>
                    <th className="text-center px-3 py-2 font-medium text-[var(--text3)]">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--text3)]">P. Unit.</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--text3)]">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {selectedInvoice.invoice_items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-[var(--text)]">{item.description}</td>
                      <td className="px-3 py-2 text-center mono text-[var(--text2)]">{item.quantity}</td>
                      <td className="px-3 py-2 text-right mono text-[var(--text2)]">{formatCurrency(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right mono font-medium text-[var(--text)]">{formatCurrency(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div className="space-y-1.5">
              {selectedInvoice.invoice_type === 'A' && (
                <>
                  <div className="flex justify-between text-sm px-1">
                    <span className="text-[var(--text3)]">Neto gravado</span>
                    <span className="mono text-[var(--text2)]">{formatCurrency(selectedInvoice.net_amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm px-1">
                    <span className="text-[var(--text3)]">IVA 21%</span>
                    <span className="mono text-[var(--text2)]">{formatCurrency(selectedInvoice.iva_amount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-bold px-1 pt-1 border-t border-[var(--border)]">
                <span className="text-[var(--text)]">Total</span>
                <span className="mono text-[var(--accent)]">{formatCurrency(selectedInvoice.total_amount)}</span>
              </div>
            </div>

            {/* AFIP status */}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-md)] ${
              selectedInvoice.afip_status === 'authorized' ? 'bg-[var(--accent-subtle)]' :
              selectedInvoice.afip_status === 'rejected'   ? 'bg-[var(--danger-subtle)]' :
              'bg-[var(--surface2)]'
            }`}>
              {selectedInvoice.afip_status === 'authorized' && <CheckCircle size={14} className="text-[var(--accent)]" />}
              {selectedInvoice.afip_status === 'rejected'   && <XCircle size={14} className="text-[var(--danger)]" />}
              {selectedInvoice.afip_status === 'pending'    && <Clock size={14} className="text-[var(--warning)]" />}
              <div>
                <p className="text-xs font-medium text-[var(--text)]">
                  {AFIP_LABELS[selectedInvoice.afip_status]}
                </p>
                {selectedInvoice.cae && (
                  <p className="text-xs text-[var(--text3)] mono">CAE: {selectedInvoice.cae}</p>
                )}
                {selectedInvoice.cae_expiry && (
                  <p className="text-xs text-[var(--text3)]">Vence: {selectedInvoice.cae_expiry}</p>
                )}
                {selectedInvoice.afip_error && (
                  <p className="text-xs text-[var(--danger)]">{selectedInvoice.afip_error}</p>
                )}
              </div>
            </div>

            {/* Botón facturar si es X */}
            {selectedInvoice.invoice_type === 'X' && (
              <Button onClick={() => { setDetailModal(false); openConvert(selectedInvoice) }} className="w-full">
                Convertir a Factura A / B / C
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal convertir a factura ── */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)}
        title="Convertir a factura" size="sm">
        <div className="space-y-4">

          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Ticket X #{String(convertTarget?.numero ?? 0).padStart(8, '0')} · {formatCurrency(convertTarget?.total_amount ?? 0)}
          </div>

          {/* Tipo de factura */}
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-2">Tipo de factura *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map(t => (
                <button key={t} onClick={() => setConvertType(t)}
                  className={`py-2.5 text-sm font-semibold rounded-[var(--radius-md)] border transition-all ${
                    convertType === t
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

          {/* Datos del receptor */}
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
    </AppShell>
  )
}
