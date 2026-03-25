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
  const [step, setStep] = useState<'form' | 'receipt'>('form')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [description, setDesc] = useState('Pago de cuenta corriente')
  const [saving, setSaving] = useState(false)
  const [payAll, setPayAll] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

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
        balanceAfter: Math.max(0, Number(customer.current_balance) - amountNum),
        paidAt: new Date().toISOString(),
      })
      setStep('receipt')
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago')
    } finally { setSaving(false) }
  }

  const handlePrint = () => {
    if (!receipt) return
    const win = window.open('', '_blank', 'width=420,height=600')
    if (!win) return

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Recibo de pago</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',Arial,sans-serif; background:#fff; color:#1a1a18; padding:32px; max-width:380px; }
        .mono { font-family:'Courier New',monospace; }
        .header { text-align:center; margin-bottom:24px; }
        .header h1 { font-size:18px; font-weight:700; margin-bottom:2px; }
        .header p { font-size:12px; color:#6a6a64; }
        .divider { border:none; border-top:1px dashed #d4d4cc; margin:16px 0; }
        .row { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
        .row .label { font-size:12px; color:#6a6a64; }
        .row .value { font-size:13px; font-weight:600; }
        .amount-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px; text-align:center; margin:16px 0; }
        .amount-box .lbl { font-size:11px; color:#16a34a; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
        .amount-box .val { font-size:32px; font-weight:700; font-family:'Courier New',monospace; color:#15803d; }
        .balance-box { background:#fafaf9; border:1px solid #e5e5e2; border-radius:10px; padding:12px 16px; }
        .balance-row { display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; }
        .balance-row:last-child { margin-bottom:0; font-size:14px; font-weight:700; padding-top:8px; border-top:1px dashed #e5e5e2; }
        .footer { text-align:center; margin-top:24px; font-size:10px; color:#b4b2a9; }
      </style>
    </head><body>
      <div class="header">
        <h1>Recibo de Pago</h1>
        <p>${formatDateTime(receipt.paidAt)}</p>
      </div>

      <div class="row"><span class="label">Cliente</span><span class="value">${receipt.customerName}</span></div>
      ${receipt.customerDoc ? `<div class="row"><span class="label">Documento</span><span class="value mono">${receipt.customerDoc}</span></div>` : ''}
      <div class="row"><span class="label">Método</span><span class="value">${METHOD_LABELS[receipt.method] ?? receipt.method}</span></div>
      ${receipt.description !== 'Pago de cuenta corriente' ? `<div class="row"><span class="label">Concepto</span><span class="value">${receipt.description}</span></div>` : ''}

      <div class="amount-box">
        <div class="lbl">Monto pagado</div>
        <div class="val">${formatCurrency(receipt.amount)}</div>
      </div>

      <div class="balance-box">
        <div class="balance-row">
          <span style="color:#6a6a64">Saldo anterior</span>
          <span class="mono">${formatCurrency(receipt.balanceBefore)}</span>
        </div>
        <div class="balance-row">
          <span style="color:#6a6a64">Pago aplicado</span>
          <span class="mono" style="color:#16a34a">− ${formatCurrency(receipt.amount)}</span>
        </div>
        <div class="balance-row">
          <span>${receipt.balanceAfter === 0 ? '✓ Saldo cancelado' : 'Saldo restante'}</span>
          <span class="mono" style="color:${receipt.balanceAfter === 0 ? '#15803d' : '#dc2626'}">${formatCurrency(receipt.balanceAfter)}</span>
        </div>
      </div>

      <div class="footer">⚡ Powered by StockOS</div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  if (!customer) return null

  const amountNum = Number(amount) || 0
  const balanceAfter = Math.max(0, Number(customer.current_balance) - amountNum)

  return (
    <Modal open={open} onClose={onClose} title={step === 'receipt' ? 'Recibo de pago' : 'Registrar pago'} size="sm">

      {/* ── Paso 1: Formulario ── */}
      {step === 'form' && (
        <div className="space-y-4">
          <div className="px-3 py-3 bg-[var(--surface2)] rounded-[var(--radius-md)]">
            <p className="text-sm font-semibold text-[var(--text)]">{customer.full_name}</p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-[var(--text3)]">Saldo actual</span>
              <span className="text-lg font-bold mono text-[var(--danger)]">
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={payAll}
              onChange={e => setPayAll(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]" />
            <span className="text-sm text-[var(--text2)]">
              Pagar saldo completo ({formatCurrency(customer.current_balance)})
            </span>
          </label>

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
                <span className="text-[var(--text)]">Saldo restante</span>
                <span className={`mono ${balanceAfter > 0 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
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
                {receipt.balanceAfter === 0 ? '✓ Saldo cancelado' : 'Saldo restante'}
              </span>
              <span className={`mono ${receipt.balanceAfter === 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
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
