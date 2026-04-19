'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, Printer } from 'lucide-react'
import type { CustomerSummary } from '@/app/customers/page'
import { useAuth } from '@/hooks/useAuth'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  customer: CustomerSummary | null
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

export function PaymentModal({ open, onClose, onSaved, customer }: PaymentModalProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<'form' | 'receipt'>('form')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [description, setDesc] = useState('Pago de cuenta corriente')
  const [saving, setSaving] = useState(false)
  const [payAll, setPayAll] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setStep('form')
      setAmount('')
      setMethod('efectivo')
      setDesc('Pago de cuenta corriente')
      setPayAll(false)
      setReceipt(null)
    }
  }, [open])

  useEffect(() => {
    if (payAll && customer) setAmount(String(customer.current_balance))
  }, [payAll, customer])

  const handleSave = async () => {
    if (!customer) return
    const amountNum = Number(amount)
    if (!amountNum || amountNum <= 0) { toast.error('Ingresá un monto válido'); return }

    setSaving(true)
    try {
      await api.post(`/api/customers/${customer.id}/payment`, {
        amount: amountNum,
        payment_method: method,
        description: description.trim() || 'Pago de cuenta corriente',
      })

      setReceipt({
        customerName: customer.full_name,
        customerDoc: customer.document,
        amount: amountNum,
        method,
        description: description.trim() || 'Pago de cuenta corriente',
        balanceBefore: Number(customer.current_balance),
        balanceAfter: Number(customer.current_balance) - amountNum,
        paidAt: new Date().toISOString(),
      })
      setStep('receipt')
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago')
    } finally { setSaving(false) }
  }

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recibo de pago</title>
  <style>
    @page { size: 80mm auto; margin: 2mm 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; background: #fff; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  if (!customer) return null

  const amountNum = Number(amount) || 0
  const currentBalance = Number(customer.current_balance)
  const hasCredit = currentBalance < 0
  const balanceAfter = currentBalance - amountNum

  return (
    <Modal open={open} onClose={onClose} title={step === 'receipt' ? 'Recibo de pago' : 'Registrar pago'} size="sm">

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

          <Input label="Monto *" type="number" min="0.01" step="0.01"
            value={amount} onChange={e => { setAmount(e.target.value); setPayAll(false) }}
            placeholder="0.00" disabled={payAll} />

          <Select label="Método de pago" options={PAYMENT_OPTIONS}
            value={method} onChange={e => setMethod(e.target.value)} />

          <Input label="Descripción" value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Ej: Pago parcial, Pago con cheque..." />

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
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: '11px',
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
                  <div style={{ fontSize: '10px', marginTop: '1px' }}>{user.business.address}</div>
                )}
                {user?.business?.phone && (
                  <div style={{ fontSize: '10px' }}>Tel: {user.business.phone}</div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.04em' }}>
                RECIBO DE PAGO
              </div>
              <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '2px' }}>
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
              <div style={{ textAlign: 'center', fontSize: '10px', lineHeight: '1.6' }}>
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

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" className="flex-1" onClick={handlePrint}>
                <Printer size={14} /> Imprimir recibo
              </Button>
              <Button className="flex-1" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
