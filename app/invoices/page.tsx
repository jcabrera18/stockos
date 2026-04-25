'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
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
import { FileText, CheckCircle, Clock, XCircle, RefreshCw, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import QRCode from 'qrcode'
import { printFacturaA4 } from '@/lib/printFactura'

interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  iva_rate: number
  subtotal: number
}

interface Invoice {
  id: string
  invoice_type: 'X' | 'A' | 'B' | 'C' | 'R'
  numero: number
  fecha: string
  sale_id?: string
  customer_id?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition: string
  net_amount: number
  iva_amount: number
  total_amount: number
  afip_cae?: string
  afip_cae_vto?: string
  afip_numero?: number
  afip_status: 'pending' | 'authorized' | 'rejected' | 'not_requested'
  afip_error?: string
  afip_requested: boolean
  notes?: string
  created_at: string
  original_invoice_id?: string
  original_invoice?: { invoice_type: string; numero: number } | { invoice_type: string; numero: number }[]
  invoice_items: InvoiceItem[]
  sales?: { payment_method: string }
  users?: { full_name: string }
  branches?: { name: string }
  registers?: { name: string }
  customers?: { full_name: string; document?: string }
}

const TYPE_LABELS: Record<string, string> = {
  X: 'Ticket X', A: 'Factura A', B: 'Factura B', C: 'Factura C', R: 'Remito',
  NCA: 'NC A', NCB: 'NC B', NCC: 'NC C',
  NDA: 'ND A', NDB: 'ND B', NDC: 'ND C',
}

const TYPE_VARIANTS: Record<string, string> = {
  X: 'default', A: 'danger', B: 'success', C: 'warning', R: 'default',
  NCA: 'default', NCB: 'default', NCC: 'default',
  NDA: 'warning', NDB: 'warning', NDC: 'warning',
}

const AFIP_LABELS: Record<string, string> = {
  not_requested: 'Sin ARCA',
  pending: 'Pendiente',
  authorized: 'Autorizado',
  rejected: 'Rechazado',
}

const AFIP_VARIANTS: Record<string, string> = {
  not_requested: 'default',
  pending: 'warning',
  authorized: 'success',
  rejected: 'danger',
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito',
  transferencia: 'Transferencia', qr: 'QR', cuenta_corriente: 'Cta. Cte.',
}

type TypeFilter = '' | 'X' | 'A' | 'B' | 'C' | 'R'

const IVA_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto',
  MO: 'Monotributista',
  EX: 'Exento',
  CF: 'Consumidor Final',
  M: 'Monotributista',
}

function buildAfipQrUrl(invoice: Invoice, cuit: string, ptoVta: number): string {
  const tipoCmpMap: Record<string, number> = {
    A: 1, B: 6, C: 11, R: 91,
    NCA: 3, NCB: 8, NCC: 13,
    NDA: 2, NDB: 7, NDC: 12,
  }
  const cuitEmisor = Number(cuit.replace(/\D/g, ''))
  const cuitReceptor = invoice.receptor_cuit
    ? Number(invoice.receptor_cuit.replace(/\D/g, ''))
    : 0
  const payload = {
    ver: 1,
    fecha: invoice.fecha,
    cuit: cuitEmisor,
    ptoVta,
    tipoCmp: tipoCmpMap[invoice.invoice_type] ?? 1,
    nroCmp: invoice.numero,
    importe: invoice.total_amount,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: invoice.receptor_cuit ? 80 : 99,
    nroDocRec: cuitReceptor,
    tipoCodAut: 'E',
    codAut: Number(invoice.afip_cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(payload))}`
}

function InvoicesPageInner() {
  const [data, setData] = useState<Invoice[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [debouncedTicket, setDebouncedTicket] = useState('')

  // Refs para evitar loops
  const typeRef = useRef(typeFilter)
  const fromRef = useRef(from)
  const toRef = useRef(to)
  const ticketRef = useRef(debouncedTicket)
  const pageRef = useRef(page)
  useEffect(() => { typeRef.current = typeFilter }, [typeFilter])
  useEffect(() => { fromRef.current = from }, [from])
  useEffect(() => { toRef.current = to }, [to])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTicket(ticketSearch), ticketSearch ? 400 : 0)
    return () => clearTimeout(t)
  }, [ticketSearch])
  useEffect(() => { ticketRef.current = debouncedTicket }, [debouncedTicket])
  useEffect(() => { pageRef.current = page }, [page])

  // Detail modal
  const [detailModal, setDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // Note modal (NC / ND)
  const [noteModal, setNoteModal] = useState(false)
  const [noteTarget, setNoteTarget] = useState<Invoice | null>(null)
  const [noteType, setNoteType] = useState<'NC' | 'ND'>('NC')
  const [noteReason, setNoteReason] = useState('')
  const [noteAmount, setNoteAmount] = useState('')
  const [creatingNote, setCreatingNote] = useState(false)

  interface NoteItem {
    id: string
    description: string
    originalQty: number
    quantity: number
    unit_price: number
    selected: boolean
  }
  const [noteItems, setNoteItems] = useState<NoteItem[]>([])
  const searchParams = useSearchParams()

  const handleCreateNote = async () => {
    if (!noteTarget) return
    if (!noteReason.trim()) { toast.error('El motivo es obligatorio'); return }

    const selectedNoteItems = noteType === 'NC' ? noteItems.filter(i => i.selected && i.quantity > 0) : []
    const computedAmount = noteType === 'NC' && selectedNoteItems.length > 0
      ? selectedNoteItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      : Number(noteAmount)

    if (!computedAmount || computedAmount <= 0) { toast.error('El monto debe ser mayor a 0'); return }
    if (noteType === 'NC' && noteItems.length > 0 && selectedNoteItems.length === 0) {
      toast.error('Seleccioná al menos un ítem a devolver'); return
    }

    setCreatingNote(true)
    try {
      const payload: Record<string, unknown> = {
        original_invoice_id: noteTarget.id,
        note_type: noteType,
        reason: noteReason.trim(),
        amount: computedAmount,
      }
      if (selectedNoteItems.length > 0) {
        payload.items = selectedNoteItems.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
        }))
      }
      await api.post('/api/invoices/note', payload)
      toast.success(`Nota de ${noteType === 'NC' ? 'Crédito' : 'Débito'} creada`)
      setNoteModal(false)
      fetchInvoices()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear la nota')
    } finally { setCreatingNote(false) }
  }

  // Convert modal
  const [convertModal, setConvertModal] = useState(false)
  const [convertTarget, setConvertTarget] = useState<Invoice | null>(null)
  const [convertType, setConvertType] = useState<'A' | 'B' | 'C'>('B')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorName, setReceptorName] = useState('')
  const [receptorAddress, setReceptorAddress] = useState('')
  const [receptorIva, setReceptorIva] = useState('CF')
  const [converting, setConverting] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        page: pageRef.current,
        limit: 20,
      }
      if (typeRef.current) params.invoice_type = typeRef.current
      if (fromRef.current) params.from = fromRef.current
      if (toRef.current) params.to = toRef.current
      if (ticketRef.current) params.ticket = ticketRef.current

      const res = await api.get<{ data: Invoice[]; pagination: PaginationType }>('/api/invoices', params)
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  const router = useRouter()
  const { user } = useAuth()
  const pendingFacturarRef = useRef<string | null>(null)

  // Fetch al cambiar filtros
  useEffect(() => { fetchInvoices() }, [typeFilter, from, to, debouncedTicket, page, fetchInvoices])

  // Reset página al cambiar filtros
  useEffect(() => { setPage(1) }, [typeFilter, from, to, debouncedTicket])

  const pendingOpenRef = useRef<string | null>(null)

  // Capturar param ?facturar al montar — solo una vez
  useEffect(() => {
    const facturarId = searchParams.get('facturar')
    const openId = searchParams.get('open')
    if (facturarId) {
      pendingFacturarRef.current = facturarId
      router.replace('/invoices')
    }
    if (openId) {
      pendingOpenRef.current = openId
      router.replace('/invoices')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Abrir modal cuando los datos están listos
  useEffect(() => {
    if (data.length === 0) return
    if (pendingFacturarRef.current) {
      const found = data.find(i => i.id === pendingFacturarRef.current)
      if (found) {
        pendingFacturarRef.current = null
        if (found.invoice_type === 'X') openConvert(found)
      }
    }
    if (pendingOpenRef.current) {
      const found = data.find(i => i.id === pendingOpenRef.current)
      if (found) {
        pendingOpenRef.current = null
        setSelectedInvoice(found)
        setDetailModal(true)
      }
    }
  }, [data])

  const handleAuthorize = async (invoice: Invoice) => {
    setAuthorizing(true)
    try {
      const updated = await api.post<Invoice>(`/api/invoices/${invoice.id}/authorize`, {})
      toast.success(`CAE obtenido: ${updated.afip_cae}`)
      setSelectedInvoice({ ...updated, invoice_items: updated.invoice_items ?? invoice.invoice_items })
      fetchInvoices()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al autorizar en ARCA')
    } finally {
      setAuthorizing(false)
    }
  }

  const openConvert = (invoice: Invoice) => {
    const customer = invoice.customers as { full_name: string; document?: string } | undefined
    setConvertTarget(invoice)
    setConvertType('B')
    setReceptorName(invoice.receptor_name ?? customer?.full_name ?? '')
    setReceptorCuit(invoice.receptor_cuit ?? customer?.document ?? '')
    setReceptorAddress(invoice.receptor_address ?? '')
    setReceptorIva(invoice.receptor_iva_condition ?? 'CF')
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
      const converted = await api.post<Invoice>('/api/invoices/convert', {
        invoice_id: convertTarget.id,
        invoice_type: convertType,
        receptor_cuit: receptorCuit || null,
        receptor_name: receptorName || null,
        receptor_address: receptorAddress || null,
        receptor_iva_condition: receptorIva,
      })
      setConvertModal(false)

      // Autorizar en ARCA automáticamente
      toast.loading('Autorizando en ARCA...', { id: 'afip-auth' })
      try {
        const authorized = await api.post<Invoice>(`/api/invoices/${converted.id}/authorize`, {})
        toast.success(`Factura ${convertType} autorizada — CAE: ${authorized.afip_cae}`, { id: 'afip-auth' })
        setSelectedInvoice({ ...authorized, invoice_items: authorized.invoice_items ?? converted.invoice_items })
      } catch (afipErr: unknown) {
        toast.error(afipErr instanceof Error ? afipErr.message : 'Error al autorizar en ARCA', { id: 'afip-auth' })
        setSelectedInvoice(converted)
      }

      setDetailModal(true)
      fetchInvoices()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    } finally { setConverting(false) }
  }

  // ── Ticket térmico 80mm ──────────────────────────────────────────────────
  const handlePrintTicket = async (invoice: Invoice) => {
    const biz = user?.business
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
    const typeLabel = TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type
    const numero = String(invoice.numero).padStart(8, '0')
    const isA = invoice.invoice_type === 'A'
    const receptorName = invoice.receptor_name
      ?? (invoice.customers as { full_name: string } | undefined)?.full_name
      ?? 'Consumidor Final'
    const ptoVenta = String(biz?.afip_punto_venta ?? 1).padStart(5, '0')
    const branchObj = invoice.branches as { name: string } | undefined
    const registerObj = invoice.registers as { name: string } | undefined
    const userObj = invoice.users as { full_name: string } | undefined
    const customersObj = invoice.customers as { document?: string } | undefined

    let qrDataUrl = ''
    if (invoice.afip_cae && biz?.cuit) {
      try {
        const url = buildAfipQrUrl(invoice, biz.cuit, biz.afip_punto_venta ?? 1)
        qrDataUrl = await QRCode.toDataURL(url, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
      } catch { /* omitir QR si falla */ }
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
      <div style="text-align:center;">Fecha: ${invoice.fecha}</div>
      ${branchObj?.name ? `<div style="text-align:center;font-size:11px;">Suc: ${branchObj.name}${registerObj?.name ? ` - ${registerObj.name}` : ''}</div>` : ''}
      ${userObj?.full_name ? `<div style="text-align:center;font-size:11px;">Cajero: ${userObj.full_name}</div>` : ''}
      ${sep}
      <div><strong>Receptor:</strong> ${receptorName}</div>
      ${invoice.receptor_cuit ? `<div style="font-size:11px;">CUIT: ${invoice.receptor_cuit}</div>` : customersObj?.document ? `<div style="font-size:11px;">Doc: ${customersObj.document}</div>` : ''}
      ${invoice.receptor_address ? `<div style="font-size:11px;">${invoice.receptor_address}</div>` : ''}
      <div style="font-size:11px;">Cond. IVA: ${IVA_LABELS[invoice.receptor_iva_condition] ?? invoice.receptor_iva_condition}</div>
      ${sep}
      ${row('<span style="font-weight:bold;font-size:11px;">DESCRIPCIÓN</span>', '<span style="font-weight:bold;font-size:11px;">IMPORTE</span>')}
      <div style="margin-top:4px;">
        ${invoice.invoice_items.map(item => `
          <div style="margin-bottom:6px;">
            ${row(
              `<span style="flex:1;padding-right:8px;word-break:break-word;">${item.quantity} ${item.description}</span>`,
              `<span style="flex-shrink:0;">${fmt(item.subtotal)}</span>`
            )}
            <div style="font-size:11px;color:#555;">  c/u ${fmt(item.unit_price)}</div>
          </div>
        `).join('')}
      </div>
      ${sep}
      ${isA ? `
        ${row('<span>Neto gravado</span>', `<span>${fmt(invoice.net_amount)}</span>`)}
        ${row('<span>IVA 21%</span>', `<span>${fmt(invoice.iva_amount)}</span>`)}
      ` : ''}
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:2px;">
        <span>TOTAL</span><span>${fmt(invoice.total_amount)}</span>
      </div>
      ${invoice.sales?.payment_method ? `<div style="margin-top:4px;font-size:11px;">Pago: ${PAYMENT_LABELS[invoice.sales.payment_method] ?? invoice.sales.payment_method}</div>` : ''}
      ${invoice.notes ? `<div style="font-size:11px;color:#555;margin-top:4px;font-style:italic;">${invoice.notes}</div>` : ''}
      ${sep}
      ${invoice.afip_cae ? `
        <div style="text-align:center;font-weight:bold;font-size:11px;">COMPROBANTE AUTORIZADO</div>
        <div style="text-align:center;font-size:11px;">CAE: ${invoice.afip_cae}</div>
        ${invoice.afip_cae_vto ? `<div style="text-align:center;font-size:11px;">Vto. CAE: ${invoice.afip_cae_vto}</div>` : ''}
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
        <div style="text-align:center;font-weight:bold;padding:2px 0;letter-spacing:0.03em;">
          *** NO VÁLIDO COMO FACTURA ***
        </div>
      `}
      ${sep}
      <div style="text-align:center;font-size:11px;line-height:1.6;">
        <div>¡Gracias por su compra!</div>
        <div style="color:#888;">Powered by StockOS</div>
      </div>
    `

    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${typeLabel} ${ptoVenta}-${numero}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm 2mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; background: #fff; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 500; line-height: 1.4; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body><div style="padding:12px 10px;">${html}</div></body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  // ── Factura A4 moderna ───────────────────────────────────────────────────
  const handlePrintFactura = (invoice: Invoice) => {
    printFacturaA4(invoice, user?.business)
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
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${typeFilter === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                {t === '' ? 'Todos' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* N° Ticket */}
          <input
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))}
            placeholder="N° Ticket..."
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] w-28 font-mono uppercase"
          />

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
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">N° Ticket</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Receptor</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">ARCA</th>
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
                    <td className="px-4 py-3 text-xs mono text-[var(--text3)] hidden sm:table-cell">
                      {(() => {
                        if (inv.sale_id) return `#${inv.sale_id.slice(-8).toUpperCase()}`
                        const orig = Array.isArray(inv.original_invoice) ? inv.original_invoice[0] : inv.original_invoice
                        if (orig) return `${TYPE_LABELS[orig.invoice_type] ?? orig.invoice_type} #${String(orig.numero).padStart(8, '0')}`
                        return '—'
                      })()}
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
              {selectedInvoice.sale_id && (
                <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                  <p className="text-xs text-[var(--text3)] mb-1">N° Ticket</p>
                  <p className="text-sm font-bold mono text-[var(--text)]">
                    #{selectedInvoice.sale_id.slice(-8).toUpperCase()}
                  </p>
                </div>
              )}
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-1">Método de pago</p>
                <p className="text-sm text-[var(--text)]">
                  {PAYMENT_LABELS[(selectedInvoice.sales as { payment_method: string } | undefined)?.payment_method ?? ''] ?? '—'}
                </p>
              </div>
            </div>

            {/* Receptor / Cliente */}
            <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
              <p className="text-xs font-medium text-[var(--text3)] mb-2">
                {selectedInvoice.customer_id ? 'Cliente' : 'Receptor'}
              </p>
              <p className="text-sm font-medium text-[var(--text)]">
                {selectedInvoice.receptor_name
                  ?? (selectedInvoice.customers as { full_name: string } | undefined)?.full_name
                  ?? 'Consumidor Final'}
              </p>
              {(selectedInvoice.customers as { document?: string } | undefined)?.document && !selectedInvoice.receptor_cuit && (
                <p className="text-xs text-[var(--text3)] mono mt-0.5">
                  Doc: {(selectedInvoice.customers as { document: string }).document}
                </p>
              )}
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
                  {(selectedInvoice.invoice_items ?? []).map(item => (
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

            {/* ARCA status */}
            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-[var(--radius-md)] ${selectedInvoice.afip_status === 'authorized' ? 'bg-[var(--accent-subtle)]' :
              selectedInvoice.afip_status === 'rejected' ? 'bg-[var(--danger-subtle)]' :
                'bg-[var(--surface2)]'
              }`}>
              {selectedInvoice.afip_status === 'authorized' && <CheckCircle size={14} className="text-[var(--accent)] mt-0.5 shrink-0" />}
              {selectedInvoice.afip_status === 'rejected' && <XCircle size={14} className="text-[var(--danger)] mt-0.5 shrink-0" />}
              {selectedInvoice.afip_status === 'pending' && <Clock size={14} className="text-[var(--warning)] mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text)]">
                  {AFIP_LABELS[selectedInvoice.afip_status]}
                </p>
                {selectedInvoice.afip_cae && (
                  <p className="text-xs text-[var(--text3)] mono break-all">CAE: {selectedInvoice.afip_cae}</p>
                )}
                {selectedInvoice.afip_cae_vto && (
                  <p className="text-xs text-[var(--text3)]">Vence: {selectedInvoice.afip_cae_vto}</p>
                )}
                {selectedInvoice.afip_error && (
                  <p className="text-xs text-[var(--danger)] break-words">{selectedInvoice.afip_error}</p>
                )}
              </div>
            </div>

            {/* Botón autorizar en ARCA si está pendiente o falló */}
            {(selectedInvoice.afip_status === 'pending' || selectedInvoice.afip_status === 'rejected') && (
              <Button onClick={() => handleAuthorize(selectedInvoice)} disabled={authorizing} className="w-full">
                {authorizing ? 'Autorizando en ARCA...' : selectedInvoice.afip_status === 'rejected' ? 'Reintentar autorización en ARCA' : 'Autorizar en ARCA'}
              </Button>
            )}

            {/* Botón facturar si es X */}
            {selectedInvoice.invoice_type === 'X' && (
              <Button onClick={() => { setDetailModal(false); openConvert(selectedInvoice) }} className="w-full">
                Convertir a Factura A / B / C
              </Button>
            )}

            {/* NC / ND si es A, B o C */}
            {['A', 'B', 'C'].includes(selectedInvoice.invoice_type) && (
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1"
                  onClick={() => {
                    setNoteTarget(selectedInvoice)
                    setNoteType('NC')
                    setNoteReason('')
                    setNoteAmount(String(selectedInvoice.total_amount))
                    setNoteItems((selectedInvoice.invoice_items ?? []).map(item => ({
                      id: item.id,
                      description: item.description,
                      originalQty: item.quantity,
                      quantity: item.quantity,
                      unit_price: item.unit_price,
                      selected: true,
                    })))
                    setDetailModal(false)
                    setNoteModal(true)
                  }}>
                  Nota de Crédito
                </Button>
                <Button variant="secondary" className="flex-1"
                  onClick={() => {
                    setNoteTarget(selectedInvoice)
                    setNoteType('ND')
                    setNoteReason('')
                    setNoteAmount('')
                    setNoteItems([])
                    setDetailModal(false)
                    setNoteModal(true)
                  }}>
                  Nota de Débito
                </Button>
              </div>
            )}

            {/* Acciones */}
            <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-2 border-t border-[var(--border)]">
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => handlePrintTicket(selectedInvoice)}>
                  <Printer size={14} /> Imprimir ticket
                </Button>
                {selectedInvoice.afip_status === 'authorized' && selectedInvoice.afip_cae && (
                  <Button variant="secondary" onClick={() => handlePrintFactura(selectedInvoice)}>
                    <FileText size={14} /> Imprimir factura
                  </Button>
                )}
                <Button variant="secondary" onClick={() => { setDetailModal(false); setSelectedInvoice(null) }}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Nota de Crédito / Débito ── */}
      <Modal open={noteModal} onClose={() => setNoteModal(false)}
        title={`Nota de ${noteType === 'NC' ? 'Crédito' : 'Débito'}`} size="sm">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Referencia: Factura {noteTarget?.invoice_type} #{String(noteTarget?.numero ?? 0).padStart(8, '0')} · {formatCurrency(noteTarget?.total_amount ?? 0)}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['NC', 'ND'] as const).map(t => (
              <button key={t} onClick={() => setNoteType(t)}
                className={`py-2.5 text-sm font-semibold rounded-[var(--radius-md)] border transition-all ${noteType === t
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)]'
                  }`}>
                {t === 'NC' ? 'Nota de Crédito' : 'Nota de Débito'}
              </button>
            ))}
          </div>

          <p className="text-xs text-[var(--text3)]">
            {noteType === 'NC'
              ? 'Reduce o anula la factura original. Ej: devolución, descuento posterior.'
              : 'Aumenta el monto de la factura original. Ej: cargo adicional, diferencia de precio.'}
          </p>

          <Input label="Motivo *" value={noteReason}
            onChange={e => setNoteReason(e.target.value)}
            placeholder="Ej: Devolución parcial de mercadería" />

          {/* Items a devolver — solo para NC */}
          {noteType === 'NC' && noteItems.length > 0 && (
            <div>
              <p className="text-sm font-medium text-[var(--text2)] mb-2">Ítems a devolver</p>
              <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden divide-y divide-[var(--border)]">
                {noteItems.map((item, idx) => (
                  <div key={item.id}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${item.selected ? 'bg-[var(--surface)]' : 'bg-[var(--surface2)] opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={e => {
                        const updated = [...noteItems]
                        updated[idx] = { ...updated[idx], selected: e.target.checked }
                        setNoteItems(updated)
                      }}
                      className="shrink-0 accent-[var(--accent)] w-4 h-4 cursor-pointer"
                    />
                    <span className="flex-1 text-xs text-[var(--text)] leading-tight">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={item.originalQty}
                        value={item.quantity}
                        disabled={!item.selected}
                        onChange={e => {
                          const v = Math.min(item.originalQty, Math.max(1, Number(e.target.value) || 1))
                          const updated = [...noteItems]
                          updated[idx] = { ...updated[idx], quantity: v }
                          setNoteItems(updated)
                        }}
                        className="w-14 text-center text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-40"
                      />
                      <span className="text-xs text-[var(--text3)] w-4 text-center">/</span>
                      <span className="text-xs text-[var(--text3)] w-4">{item.originalQty}</span>
                    </div>
                    <span className="text-xs mono text-[var(--text2)] shrink-0 w-20 text-right">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </span>
                  </div>
                ))}
              </div>
              {(() => {
                const total = noteItems.filter(i => i.selected).reduce((s, i) => s + i.quantity * i.unit_price, 0)
                return total > 0 ? (
                  <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-xs text-[var(--text3)]">Total a acreditar</span>
                    <span className="text-sm font-bold mono text-[var(--accent)]">{formatCurrency(total)}</span>
                  </div>
                ) : null
              })()}
            </div>
          )}

          {/* Monto manual — solo para ND o si no hay items */}
          {(noteType === 'ND' || noteItems.length === 0) && (
            <Input label="Monto *" type="number" min="0" step="0.01"
              value={noteAmount}
              onChange={e => setNoteAmount(e.target.value)}
              placeholder="0.00"
              hint={noteTarget?.invoice_type === 'A' ? 'Ingresá el monto total con IVA incluido' : ''} />
          )}

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNoteModal(false)} disabled={creatingNote}>Cancelar</Button>
              <Button onClick={handleCreateNote} loading={creatingNote}>
                Crear Nota de {noteType === 'NC' ? 'Crédito' : 'Débito'}
              </Button>
            </div>
          </div>
        </div>
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

export default function InvoicesPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <InvoicesPageInner />
    </Suspense>
  )
}
