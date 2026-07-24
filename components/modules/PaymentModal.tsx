'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { printThermal } from '@/lib/printTicket'
import { shareTicketImage } from '@/lib/shareTicket'
import { toast } from 'sonner'
import { CheckCircle, Printer, FileText, MessageCircle } from 'lucide-react'
import type { CustomerSummary } from '@/app/customers/page'
import { useAuth } from '@/hooks/useAuth'
import { useWorkstation } from '@/hooks/useWorkstation'
import { ConvertInvoiceModal } from '@/components/modules/ConvertInvoiceModal'
import { CashRegisterPicker, type RegisterWithBranch } from '@/components/modules/CashRegisterPicker'
import { PaymentReceiptShareCard } from '@/components/modules/PaymentReceiptShareCard'

/** Movimiento recién registrado, para que el detalle lo refleje al instante. */
export interface SavedMovement {
  type: 'payment' | 'adjustment'
  amount: number          // negativo = baja deuda (pago), positivo = sube deuda (ajuste)
  balance_after: number
  description: string
  payment_method?: string
  created_at: string
}

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSaved: (movement?: SavedMovement) => void
  customer: CustomerSummary | null
  /** Segmento inicial: 'pay' (cobrar) o 'debt' (agregar deuda). Default: 'pay'. */
  initialTab?: 'pay' | 'debt'
}

interface ReceiptData {
  customerName: string
  customerDoc?: string
  amount: number
  method: string
  description: string
  balanceBefore: number
  balanceAfter: number
  paidAt: string
}

const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
  { value: 'cheque', label: 'Cheque' },
]

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  debito: 'Débito', credito: 'Crédito', qr: 'QR', cheque: 'Cheque',
}

export function PaymentModal({ open, onClose, onSaved, customer, initialTab = 'pay' }: PaymentModalProps) {
  const { user } = useAuth()
  const { workstation } = useWorkstation()
  // Solo owner/admin puede agregar deuda (coincide con el backend: /adjustment es adminOnly)
  const canAddDebt = user?.role === 'owner' || user?.role === 'admin'
  // Facturar el cobro implica autorizar en AFIP, que es solo owner/admin.
  const canInvoice = user?.role === 'owner' || user?.role === 'admin'

  const [tab, setTab] = useState<'pay' | 'debt'>(initialTab)
  const [step, setStep] = useState<'form' | 'receipt'>('form')

  // ── Cobrar ──
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [description, setDesc] = useState('Pago de cuenta corriente')
  const [payAll, setPayAll] = useState(false)

  // ── Sucursal / caja donde impacta el cobro (arqueo) ──
  const [allRegisters, setAllRegisters] = useState<RegisterWithBranch[]>([])
  const [collectBranchId, setCollectBranchId] = useState<string | null>(null)
  const [collectRegisterId, setCollectRegisterId] = useState<string | null>(null)
  const collectDefaultsSet = useRef(false)

  // ── Agregar deuda ──
  const [debtMode, setDebtMode] = useState<'percent' | 'fixed'>('percent')
  const [percent, setPercent] = useState('')
  const [debtAmount, setDebtAmount] = useState('')
  const [debtReason, setDebtReason] = useState('Recargo por mora')

  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // ── Compartir recibo por WhatsApp (tarjeta linda, no el ticket térmico) ──
  const shareCardRef = useRef<HTMLDivElement>(null)
  const sharingRef = useRef(false)
  const [sharing, setSharing] = useState(false)

  // ── Facturar el cobro ──
  const [invoicing, setInvoicing] = useState(false)
  const [convertInvoiceId, setConvertInvoiceId] = useState<string | null>(null)
  const [showConvert, setShowConvert] = useState(false)
  const [savedMovementId, setSavedMovementId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTab(canAddDebt ? initialTab : 'pay')
      setStep('form')
      setAmount('')
      setMethod('efectivo')
      setDesc('Pago de cuenta corriente')
      setPayAll(false)
      setDebtMode('percent')
      setPercent('')
      setDebtAmount('')
      setDebtReason('Recargo por mora')
      setReceipt(null)
      setInvoicing(false)
      setConvertInvoiceId(null)
      setShowConvert(false)
      setSavedMovementId(null)
    }
  }, [open, initialTab, canAddDebt])

  useEffect(() => {
    if (payAll && customer) setAmount(String(customer.current_balance))
  }, [payAll, customer])

  // Cajas del negocio (sucursal + estado abierta/cerrada) para el selector de cobro.
  useEffect(() => {
    if (!open) return
    api.get<RegisterWithBranch[]>('/api/branches/all-registers')
      .then(regs => setAllRegisters(regs ?? []))
      .catch(() => {})
  }, [open])

  // Precarga sucursal/caja con el workstation del usuario logueado (una sola vez).
  useEffect(() => {
    if (collectDefaultsSet.current || allRegisters.length === 0) return
    collectDefaultsSet.current = true
    const branchIds = new Set(allRegisters.map(r => r.branches?.id).filter(Boolean))
    const defBranch = (workstation?.branch_id && branchIds.has(workstation.branch_id))
      ? workstation.branch_id
      : allRegisters.find(r => r.is_open)?.branches?.id
      ?? allRegisters[0]?.branches?.id ?? null
    setCollectBranchId(defBranch)
    const wsReg = allRegisters.find(r => r.id === workstation?.register_id)
    setCollectRegisterId(wsReg?.is_open ? wsReg.id : null)
  }, [allRegisters, workstation?.branch_id, workstation?.register_id])

  // Al cambiar de sucursal, la caja elegida deja de ser válida si no pertenece.
  const handleCollectBranchChange = useCallback((bid: string | null) => {
    setCollectBranchId(bid)
    setCollectRegisterId(prev => {
      const reg = allRegisters.find(r => r.id === prev)
      return reg && reg.branches?.id === bid ? prev : null
    })
  }, [allRegisters])

  const handleSave = async () => {
    if (!customer) return
    const amountNum = Number(amount)
    if (!amountNum || amountNum <= 0) { toast.error('Ingresá un monto válido'); return }

    setSaving(true)
    try {
      const res = await api.post<{ account_movement_id?: string | null }>(`/api/customers/${customer.id}/payment`, {
        amount: amountNum,
        payment_method: method,
        description: description.trim() || 'Pago de cuenta corriente',
        // El efectivo suma al esperado; otros medios quedan como info del turno.
        // 'cuenta_corriente' no aplica (no es un cobro que entra a la caja).
        ...(method !== 'cuenta_corriente' && collectRegisterId
          ? { register_id: collectRegisterId }
          : {}),
      })
      setSavedMovementId(res?.account_movement_id ?? null)

      const desc = description.trim() || 'Pago de cuenta corriente'
      const balanceAfter = Number(customer.current_balance) - amountNum
      const paidAt = new Date().toISOString()
      setReceipt({
        customerName: customer.full_name,
        customerDoc: customer.document,
        amount: amountNum,
        method,
        description: desc,
        balanceBefore: Number(customer.current_balance),
        balanceAfter,
        paidAt,
      })
      setStep('receipt')
      onSaved({ type: 'payment', amount: -amountNum, balance_after: balanceAfter, description: desc, payment_method: method, created_at: paidAt })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago')
    } finally { setSaving(false) }
  }

  const handleAddDebt = async () => {
    if (!customer) return
    const debtNum = Math.round(debtComputed * 100) / 100
    if (!debtNum || debtNum <= 0) { toast.error('Ingresá un monto o porcentaje válido'); return }

    const reason = debtReason.trim() || 'Ajuste de deuda'
    const fullDesc = debtMode === 'percent' && Number(percent) > 0
      ? `${reason} (${percent}%)`
      : reason

    setSaving(true)
    try {
      const res = await api.post<{ success: boolean; balance_after?: number }>(`/api/customers/${customer.id}/adjustment`, {
        amount: debtNum, // positivo = suma deuda
        description: fullDesc,
      })
      toast.success(`Se agregaron ${formatCurrency(debtNum)} a la deuda`)
      const balanceAfter = res?.balance_after ?? (Number(customer.current_balance) + debtNum)
      onSaved({ type: 'adjustment', amount: debtNum, balance_after: balanceAfter, description: fullDesc, created_at: new Date().toISOString() })
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar la deuda')
    } finally { setSaving(false) }
  }

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    printThermal('Recibo de pago', content.innerHTML)
  }

  const handleShareWhatsApp = async () => {
    if (!receipt || !shareCardRef.current) return
    // Guard reentrante: botón podría dispararse dos veces casi juntas.
    if (sharingRef.current) return
    sharingRef.current = true
    setSharing(true)
    try {
      const res = await shareTicketImage(shareCardRef.current, {
        fileName: `recibo-${receipt.paidAt.slice(0, 10)}.png`,
        customerPhone: customer?.phone ?? undefined,
      })
      if (res === 'downloaded') {
        toast.success('Recibo descargado — adjuntalo en el chat de WhatsApp', { duration: 6000 })
      }
    } catch (err) {
      toast.error('No se pudo generar la imagen')
      console.error(err)
    } finally {
      sharingRef.current = false
      setSharing(false)
    }
  }

  // Crea un Ticket X por el monto entregado y abre la conversión → AFIP.
  const handleInvoice = async () => {
    if (!customer || !receipt) return
    // Si ya se creó el Ticket X en un intento previo, reabrir la conversión en
    // vez de generar otro comprobante huérfano.
    if (convertInvoiceId) { setShowConvert(true); return }
    setInvoicing(true)
    try {
      const invoice = await api.post<{ id: string }>('/api/invoices/from-payment', {
        customer_id: customer.id,
        amount: receipt.amount,
        account_movement_id: savedMovementId,
      })
      setConvertInvoiceId(invoice.id)
      setShowConvert(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al generar el comprobante')
    } finally {
      setInvoicing(false)
    }
  }

  if (!customer) return null

  const amountNum = Number(amount) || 0
  const currentBalance = Number(customer.current_balance)
  const hasCredit = currentBalance < 0
  const balanceAfter = currentBalance - amountNum

  const debtComputed = debtMode === 'percent'
    ? Math.abs(currentBalance) * (Number(percent) || 0) / 100
    : Number(debtAmount) || 0
  const balanceAfterDebt = currentBalance + debtComputed

  const modalTitle = step === 'receipt'
    ? 'Recibo de pago'
    : tab === 'debt' ? 'Agregar deuda' : 'Registrar pago'

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="sm">

      {/* ── Paso 1: Formulario ── */}
      {step === 'form' && (
        <div className="space-y-4">
          <div className="px-3 py-3 bg-[var(--surface2)] rounded-[var(--radius-md)]">
            <p className="text-sm font-semibold text-[var(--text)]">{customer.full_name}</p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-[var(--text3)]">Saldo actual</span>
              <span className={`text-lg font-bold mono ${hasCredit ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                {formatCurrency(customer.current_balance)}
              </span>
            </div>
            {customer.credit_limit > 0 && (
              <div className="flex justify-between items-center mt-0.5">
                <span className="text-xs text-[var(--text3)]">Límite de crédito</span>
                <span className="text-xs mono text-[var(--text2)]">{formatCurrency(customer.credit_limit)}</span>
              </div>
            )}
          </div>

          {/* Control segmentado: Cobrar / Agregar deuda (solo owner/admin) */}
          {canAddDebt && (
            <div className="flex p-1 gap-1 bg-[var(--surface2)] rounded-[var(--radius-md)]">
              {(['pay', 'debt'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-colors ${tab === t
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--text3)] hover:text-[var(--text2)]'
                    }`}
                >
                  {t === 'pay' ? 'Cobrar' : 'Agregar deuda'}
                </button>
              ))}
            </div>
          )}

          {/* ── Segmento Cobrar ── */}
          {tab === 'pay' && (
            <>
              {!hasCredit && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={payAll}
                    onChange={e => setPayAll(e.target.checked)}
                    className="w-4 h-4 accent-[var(--accent)]" />
                  <span className="text-sm text-[var(--text2)]">
                    Pagar saldo completo ({formatCurrency(customer.current_balance)})
                  </span>
                </label>
              )}

              <MoneyInput label="Monto *"
                value={amount} onChange={v => { setAmount(v); setPayAll(false) }}
                placeholder="0" disabled={payAll} />

              <Select label="Método de pago" options={PAYMENT_OPTIONS}
                value={method} onChange={e => setMethod(e.target.value)} />

              <Input label="Descripción" value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej: Pago parcial, Pago con cheque..." />

              {/* Sucursal + caja donde impacta el cobro (arqueo). El efectivo suma
                  al esperado de la caja elegida; otros medios quedan informativos. */}
              <CashRegisterPicker
                registers={allRegisters}
                branchId={collectBranchId}
                registerId={collectRegisterId}
                onBranchChange={handleCollectBranchChange}
                onRegisterChange={setCollectRegisterId}
              />

              {amountNum > 0 && (
                <div className="space-y-1 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                  <div className="flex justify-between text-xs text-[var(--text3)]">
                    <span>Saldo anterior</span>
                    <span className="mono">{formatCurrency(customer.current_balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--accent)]">
                    <span>Pago aplicado</span>
                    <span className="mono">− {formatCurrency(amountNum)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-[var(--border)]">
                    <span className="text-[var(--text)]">
                      {balanceAfter === 0 ? '✓ Saldo cancelado' : balanceAfter < 0 ? 'Saldo a favor' : 'Saldo restante'}
                    </span>
                    <span className={`mono ${balanceAfter < 0 ? 'text-[var(--accent)]' : balanceAfter === 0 ? 'text-[var(--accent)]' : 'text-[var(--warning)]'}`}>
                      {formatCurrency(balanceAfter)}
                    </span>
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 border-t border-[var(--border)]">
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                  <Button onClick={handleSave} loading={saving}>Confirmar pago</Button>
                </div>
              </div>
            </>
          )}

          {/* ── Segmento Agregar deuda ── */}
          {tab === 'debt' && canAddDebt && (
            <>
              {/* Toggle Porcentaje / Monto fijo */}
              <div className="flex p-1 gap-1 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                {(['percent', 'fixed'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDebtMode(m)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] transition-colors ${debtMode === m
                      ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                      : 'text-[var(--text3)] hover:text-[var(--text2)]'
                      }`}
                  >
                    {m === 'percent' ? 'Porcentaje' : 'Monto fijo'}
                  </button>
                ))}
              </div>

              {debtMode === 'percent' ? (
                <Input label="Porcentaje sobre el saldo *" type="number" min="0.01" step="0.01"
                  value={percent} onChange={e => setPercent(e.target.value)}
                  placeholder="Ej: 10" hint="Se calcula sobre el saldo deudor actual" />
              ) : (
                <MoneyInput label="Monto a agregar *"
                  value={debtAmount} onChange={v => setDebtAmount(v)}
                  placeholder="0" />
              )}

              <Input label="Motivo" value={debtReason}
                onChange={e => setDebtReason(e.target.value)}
                placeholder="Ej: Recargo por mora, Interés..." />

              {debtComputed > 0 && (
                <div className="space-y-1 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                  <div className="flex justify-between text-xs text-[var(--text3)]">
                    <span>Saldo actual</span>
                    <span className="mono">{formatCurrency(currentBalance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--danger)]">
                    <span>{debtMode === 'percent' ? `Recargo (${percent || 0}%)` : 'Recargo'}</span>
                    <span className="mono">+ {formatCurrency(debtComputed)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-[var(--border)]">
                    <span className="text-[var(--text)]">Nuevo saldo</span>
                    <span className="mono text-[var(--danger)]">{formatCurrency(balanceAfterDebt)}</span>
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 border-t border-[var(--border)]">
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                  <Button onClick={handleAddDebt} loading={saving} disabled={debtComputed <= 0}>
                    Agregar deuda
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Paso 2: Recibo ── */}
      {step === 'receipt' && receipt && (
        <div className="space-y-4" ref={receiptRef}>

          {/* Ticket térmico oculto (solo para impresión) */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '302px' }}>
            <div
              ref={printRef}
              style={{
                fontFamily: 'Arial, Helvetica, sans-serif',
                fontSize: '12px',
                fontWeight: 500,
                lineHeight: 1.4,
                color: '#000',
                background: '#fff',
                width: '302px',
                padding: '12px 10px',
              }}
            >
              {/* Encabezado negocio */}
              <div style={{ textAlign: 'center', marginBottom: '2px' }}>
                <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
                  {user?.business?.name ?? ''}
                </div>
                {user?.business?.cuit && (
                  <div style={{ marginTop: '2px' }}>CUIT: {user.business.cuit}</div>
                )}
                {user?.business?.address && (
                  <div style={{ fontSize: '11px', marginTop: '1px' }}>{user.business.address}</div>
                )}
                {user?.business?.phone && (
                  <div style={{ fontSize: '11px' }}>Tel: {user.business.phone}</div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.04em' }}>
                RECIBO DE PAGO
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '2px' }}>
                Fecha: {formatDateTime(receipt.paidAt)}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Datos del cliente */}
              <div style={{ lineHeight: '1.6' }}>
                <div style={{ fontWeight: 'bold' }}>{receipt.customerName}</div>
                {receipt.customerDoc && <div>Doc: {receipt.customerDoc}</div>}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Concepto y método */}
              <div style={{ lineHeight: '1.6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Método</span>
                  <span>{METHOD_LABELS[receipt.method] ?? receipt.method}</span>
                </div>
                {receipt.description !== 'Pago de cuenta corriente' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Concepto</span>
                    <span style={{ textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' }}>{receipt.description}</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Monto pagado */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}>
                <span>MONTO PAGADO</span>
                <span>{formatCurrency(receipt.amount)}</span>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Saldos */}
              <div style={{ lineHeight: '1.8', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Saldo anterior</span>
                  <span>{formatCurrency(receipt.balanceBefore)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pago aplicado</span>
                  <span>− {formatCurrency(receipt.amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>
                    {receipt.balanceAfter === 0 ? 'Saldo cancelado' : receipt.balanceAfter < 0 ? 'Saldo a favor' : 'Saldo restante'}
                  </span>
                  <span>{formatCurrency(receipt.balanceAfter)}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              {/* Footer */}
              <div style={{ textAlign: 'center', fontSize: '11px', lineHeight: '1.6' }}>
                <div>¡Gracias por su pago!</div>
                <div style={{ color: '#888' }}>Powered by StockOS</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center py-2 gap-1">
            <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center">
              <CheckCircle size={20} className="text-[var(--accent)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--text)]">Pago registrado</p>
            <p className="text-xs text-[var(--text3)]">{formatDateTime(receipt.paidAt)}</p>
          </div>

          {/* Monto destacado */}
          <div className="text-center py-4 bg-[var(--accent-subtle)] rounded-[var(--radius-lg)]">
            <p className="text-xs text-[var(--accent)] font-medium uppercase tracking-wide mb-1">Monto pagado</p>
            <p className="text-4xl font-bold mono text-[var(--accent)]">{formatCurrency(receipt.amount)}</p>
            <p className="text-xs text-[var(--text3)] mt-1">{METHOD_LABELS[receipt.method] ?? receipt.method}</p>
          </div>

          {/* Info del pago */}
          <div className="space-y-2 px-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text3)]">Cliente</span>
              <span className="font-medium text-[var(--text)]">{receipt.customerName}</span>
            </div>
            {receipt.customerDoc && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text3)]">Documento</span>
                <span className="mono text-[var(--text2)]">{receipt.customerDoc}</span>
              </div>
            )}
            {receipt.description !== 'Pago de cuenta corriente' && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text3)]">Concepto</span>
                <span className="text-[var(--text2)]">{receipt.description}</span>
              </div>
            )}
          </div>

          {/* Saldos */}
          <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-3 space-y-2">
            <div className="flex justify-between text-xs text-[var(--text3)]">
              <span>Saldo anterior</span>
              <span className="mono">{formatCurrency(receipt.balanceBefore)}</span>
            </div>
            <div className="flex justify-between text-xs text-[var(--accent)]">
              <span>Pago aplicado</span>
              <span className="mono">− {formatCurrency(receipt.amount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-[var(--border)]">
              <span className="text-[var(--text)]">
                {receipt.balanceAfter === 0 ? '✓ Saldo cancelado' : receipt.balanceAfter < 0 ? 'Saldo a favor' : 'Saldo restante'}
              </span>
              <span className={`mono ${receipt.balanceAfter <= 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                {formatCurrency(receipt.balanceAfter)}
              </span>
            </div>
          </div>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)] space-y-2">
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={handlePrint}>
                <Printer size={14} /> Imprimir
              </Button>
              <Button variant="secondary" onClick={handleShareWhatsApp} loading={sharing}
                className="flex-1 !bg-[#25d366] !border-[#25d366] !text-white hover:!bg-[#20bd5a]">
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </div>
            {canInvoice && (
              <Button variant="secondary" className="w-full" onClick={handleInvoice} loading={invoicing}>
                <FileText size={14} /> Facturar
              </Button>
            )}
            <Button className="w-full" onClick={onClose}>Cerrar</Button>
          </div>

          {/* Tarjeta oculta off-screen — solo para capturar la imagen de WhatsApp */}
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden>
            <PaymentReceiptShareCard
              ref={shareCardRef}
              business={{
                name: user?.business?.name,
                cuit: user?.business?.cuit,
                address: user?.business?.address,
                phone: user?.business?.phone,
              }}
              customerName={receipt.customerName}
              customerDoc={receipt.customerDoc}
              amount={receipt.amount}
              methodLabel={METHOD_LABELS[receipt.method] ?? receipt.method}
              description={receipt.description}
              balanceBefore={receipt.balanceBefore}
              balanceAfter={receipt.balanceAfter}
              paidAt={receipt.paidAt}
            />
          </div>
        </div>
      )}

      {/* Facturar el cobro: Ticket X → conversión A/B/C → AFIP. Montado encima
          del recibo con zIndex mayor. */}
      <ConvertInvoiceModal
        open={showConvert}
        invoiceId={convertInvoiceId}
        fallbackCustomerName={customer.full_name}
        zIndex={60}
        onClose={() => setShowConvert(false)}
        onSuccess={() => { setShowConvert(false); onSaved(); onClose() }}
      />
    </Modal>
  )
}
