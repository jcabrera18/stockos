'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { printFacturaA4 } from '@/lib/printFactura'

interface InvoiceSummary {
  id: string
  invoice_type: string
  numero: number
  fecha: string
  total_amount: number
  net_amount: number
  iva_amount: number
  afip_status: string
  afip_cae?: string
  afip_cae_vto?: string
  receptor_name?: string
  receptor_cuit?: string
  receptor_address?: string
  receptor_iva_condition: string
  notes?: string
  invoice_items: { id: string; description: string; quantity: number; unit_price: number; iva_rate?: number; subtotal: number }[]
}

interface ConvertInvoiceModalProps {
  open: boolean
  onClose: () => void
  invoiceId: string | null
  fallbackCustomerName?: string
  onSuccess?: () => void
}

export function ConvertInvoiceModal({ open, onClose, invoiceId, fallbackCustomerName, onSuccess }: ConvertInvoiceModalProps) {
  const { user } = useAuth()
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null)
  const [convertType, setConvertType] = useState<'A' | 'B' | 'C'>('B')
  const [receptorName, setReceptorName] = useState('')
  const [receptorCuit, setReceptorCuit] = useState('')
  const [receptorAddress, setReceptorAddress] = useState('')
  const [receptorIva, setReceptorIva] = useState('CF')
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    if (!open || !invoiceId) return
    setInvoice(null)
    api.get<InvoiceSummary>(`/api/invoices/${invoiceId}`)
      .then(inv => {
        setInvoice(inv)
        setConvertType('B')
        setReceptorName(inv.receptor_name ?? fallbackCustomerName ?? '')
        setReceptorCuit(inv.receptor_cuit ?? '')
        setReceptorAddress(inv.receptor_address ?? '')
        setReceptorIva(inv.receptor_iva_condition ?? 'CF')
      })
      .catch(() => toast.error('Error al cargar el comprobante'))
  }, [open, invoiceId]) // eslint-disable-line react-hooks/exhaustive-deps

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

      toast.loading('Autorizando en ARCA...', { id: 'afip-auth' })
      try {
        const authorized = await api.post<InvoiceSummary>(`/api/invoices/${converted.id}/authorize`, {})
        toast.success(`Factura ${convertType} autorizada — CAE: ${authorized.afip_cae}`, { id: 'afip-auth' })
        const merged = { ...authorized, invoice_items: authorized.invoice_items ?? converted.invoice_items }
        await printFacturaA4(merged, user?.business, fallbackCustomerName)
      } catch (afipErr: unknown) {
        toast.error(afipErr instanceof Error ? afipErr.message : 'Error al autorizar en ARCA', { id: 'afip-auth' })
      }
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir')
    } finally {
      setConverting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Convertir a factura" size="sm">
      <div className="space-y-4">

        {invoice ? (
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Ticket X #{String(invoice.numero).padStart(8, '0')} · {formatCurrency(invoice.total_amount)}
          </div>
        ) : (
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Cargando comprobante...
          </div>
        )}

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
            <Button variant="secondary" onClick={onClose} disabled={converting}>Cancelar</Button>
            <Button onClick={handleConvert} loading={converting} disabled={!invoice}>
              Generar Factura {convertType}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
