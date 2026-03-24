'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import type { CustomerSummary } from '@/app/customers/page'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  customer: CustomerSummary | null
}

const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
  { value: 'cheque', label: 'Cheque' },
]

export function PaymentModal({ open, onClose, onSaved, customer }: PaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('efectivo')
  const [description, setDesc] = useState('Pago de cuenta corriente')
  const [saving, setSaving] = useState(false)
  const [payAll, setPayAll] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount('')
      setMethod('efectivo')
      setDesc('Pago de cuenta corriente')
      setPayAll(false)
    }
  }, [open])

  useEffect(() => {
    if (payAll && customer) {
      setAmount(String(customer.current_balance))
    }
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
      toast.success(`Pago de ${formatCurrency(amountNum)} registrado`)
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago')
    } finally { setSaving(false) }
  }

  if (!customer) return null

  const amountNum = Number(amount) || 0
  const balanceAfter = Math.max(0, Number(customer.current_balance) - amountNum)

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago" size="sm">
      <div className="space-y-4">

        {/* Info cliente */}
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

        {/* Pagar todo */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={payAll}
            onChange={e => setPayAll(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text2)]">
            Pagar saldo completo ({formatCurrency(customer.current_balance)})
          </span>
        </label>

        <Input
          label="Monto *"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={e => { setAmount(e.target.value); setPayAll(false) }}
          placeholder="0.00"
          disabled={payAll}
        />

        <Select
          label="Método de pago"
          options={PAYMENT_OPTIONS}
          value={method}
          onChange={e => setMethod(e.target.value)}
        />

        <Input
          label="Descripción"
          value={description}
          onChange={e => setDesc(e.target.value)}
          placeholder="Ej: Pago parcial, Pago con cheque..."
        />

        {/* Preview saldo después del pago */}
        {amountNum > 0 && (
          <div className="flex justify-between items-center px-3 py-2 bg-[var(--accent-subtle)] rounded-[var(--radius-md)]">
            <span className="text-xs text-[var(--text2)]">Saldo después del pago</span>
            <span className={`text-sm font-bold mono ${balanceAfter > 0 ? 'text-[var(--warning)]' : 'text-[var(--accent)]'}`}>
              {formatCurrency(balanceAfter)}
            </span>
          </div>
        )}

        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Confirmar pago</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
