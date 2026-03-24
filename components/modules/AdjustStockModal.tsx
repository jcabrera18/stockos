'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Product } from '@/types'

interface AdjustStockModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  product: Product | null
}

export function AdjustStockModal({ open, onClose, onSaved, product }: AdjustStockModalProps) {
  const [type, setType] = useState<'add' | 'remove'>('add')
  const [quantity, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setQty(''); setReason(''); setType('add') }

  const handleSave = async () => {
    if (!product) return
    if (!quantity || Number(quantity) <= 0) {
      toast.error('Ingresá una cantidad válida')
      return
    }
    if (!reason.trim()) {
      toast.error('El motivo es obligatorio')
      return
    }

    setSaving(true)
    try {
      const delta = type === 'add' ? Number(quantity) : -Number(quantity)
      await api.post(`/api/products/${product.id}/adjust-stock`, {
        quantity: delta,
        reason: reason.trim(),
      })
      toast.success(`Stock ${type === 'add' ? 'agregado' : 'descontado'} correctamente`)
      reset()
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al ajustar')
    } finally {
      setSaving(false)
    }
  }

  const newStock = product
    ? type === 'add'
      ? product.stock_current + (Number(quantity) || 0)
      : product.stock_current - (Number(quantity) || 0)
    : 0

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Ajuste de stock" size="sm">
      {product && (
        <div className="space-y-4">

          {/* Info producto */}
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
            <p className="text-sm font-medium text-[var(--text)]">{product.name}</p>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              Stock actual: <span className="font-semibold mono text-[var(--text)]">{product.stock_current}</span>
            </p>
          </div>

          {/* Tipo de ajuste */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('add')}
              className={`py-2 text-sm rounded-[var(--radius-md)] font-medium transition-colors border ${type === 'add'
                  ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)]'
                }`}
            >
              + Entrada
            </button>
            <button
              onClick={() => setType('remove')}
              className={`py-2 text-sm rounded-[var(--radius-md)] font-medium transition-colors border ${type === 'remove'
                  ? 'bg-[var(--danger-subtle)] border-[var(--danger)] text-[var(--danger)]'
                  : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)]'
                }`}
            >
              − Salida
            </button>
          </div>

          <Input
            label="Cantidad"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={e => setQty(e.target.value)}
            placeholder="0"
          />

          {/* Preview nuevo stock */}
          {quantity && Number(quantity) > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] text-sm">
              <span className="text-[var(--text3)]">Stock resultante:</span>
              <span className={`font-bold mono text-lg ${newStock < 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                {newStock}
              </span>
            </div>
          )}

          <Input
            label="Motivo *"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: Recepción de mercadería, merma, etc."
          />

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { reset(); onClose() }} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant={type === 'remove' ? 'danger' : 'primary'}
                onClick={handleSave}
                loading={saving}
                disabled={newStock < 0}
              >
                Confirmar ajuste
              </Button>
            </div>
          </div>

        </div>
      )}
    </Modal>
  )
}
