'use client'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Product } from '@/types'

interface Warehouse {
  id: string
  name: string
}

interface AdjustStockModalProps {
  open: boolean
  onClose: () => void
  // `delta` es el cambio aplicado al stock (+entrada / −salida). Permite al padre
  // reconciliar de forma optimista contra el lag de la réplica al refetchear.
  onSaved: (delta?: number) => void
  product: Product | null
  warehouseId?: string
  stockCurrent?: number
}

export function AdjustStockModal({ open, onClose, onSaved, product, warehouseId, stockCurrent }: AdjustStockModalProps) {
  const [type, setType] = useState<'add' | 'remove'>('add')
  const [quantity, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [stockMax, setStockMax] = useState('')
  const [saving, setSaving] = useState(false)

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [warehouseStock, setWarehouseStock] = useState<number | null>(null)
  const [loadingWarehouseStock, setLoadingWarehouseStock] = useState(false)

  useEffect(() => {
    if (product) {
      setStockMin(String(product.stock_min ?? 0))
      setStockMax(String(product.stock_max ?? 9999))
    }
  }, [product])

  // Cargar depósitos al abrir
  useEffect(() => {
    if (!open) return
    api.get<Warehouse[]>('/api/warehouses')
      .then(data => {
        setWarehouses(data)
        const defaultId = warehouseId ?? data[0]?.id ?? ''
        setSelectedWarehouseId(defaultId)
      })
      .catch(() => {})
  }, [open, warehouseId])

  // Cargar stock del depósito seleccionado
  useEffect(() => {
    if (!open || !selectedWarehouseId || !product) { setWarehouseStock(null); return }
    setLoadingWarehouseStock(true)
    api.get<{ data: { product_id?: string; id: string; stock_current: number }[] }>(
      '/api/stock',
      { warehouse_id: selectedWarehouseId, search: product.name, limit: 10 }
    )
      .then(res => {
        const match = res.data.find(i => (i.product_id ?? i.id) === product.id)
        setWarehouseStock(match ? match.stock_current : 0)
      })
      .catch(() => setWarehouseStock(null))
      .finally(() => setLoadingWarehouseStock(false))
  }, [open, selectedWarehouseId, product])

  const reset = () => { setQty(''); setReason(''); setType('add'); setWarehouseStock(null) }

  const handleSave = async () => {
    if (!product) return
    if (!quantity || Number(quantity) <= 0) { toast.error('Ingresá una cantidad válida'); return }
    if (!reason.trim()) { toast.error('El motivo es obligatorio'); return }

    setSaving(true)
    try {
      const delta = type === 'add' ? Number(quantity) : -Number(quantity)
      await Promise.all([
        selectedWarehouseId
          ? api.patch(`/api/warehouses/${selectedWarehouseId}/stock/${product.id}`, {
              quantity: delta,
              reason: reason.trim(),
            })
          : api.post(`/api/products/${product.id}/adjust-stock`, {
              quantity: delta,
              reason: reason.trim(),
            }),
        api.patch(`/api/products/${product.id}`, {
          stock_min: Number(stockMin) || 0,
          stock_max: Number(stockMax) || 9999,
        }),
      ])
      toast.success(`Stock ${type === 'add' ? 'agregado' : 'descontado'} correctamente`)
      reset()
      onSaved(delta)
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al ajustar')
    } finally {
      setSaving(false)
    }
  }

  const currentStock = warehouseStock ?? stockCurrent ?? 0
  const newStock = type === 'add'
    ? currentStock + (Number(quantity) || 0)
    : currentStock - (Number(quantity) || 0)

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Ajuste de stock" size="sm">
      {product && (
        <div className="space-y-4">

          {/* Info producto */}
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
            <p className="text-sm font-medium text-[var(--text)]">{product.name}</p>
          </div>

          {/* Selector de depósito */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text2)]">Depósito</label>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="w-full px-3 pr-8 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">Seleccioná un depósito</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {selectedWarehouseId && (
              <p className="text-xs text-[var(--text3)]">
                Stock actual en este depósito:{' '}
                {loadingWarehouseStock
                  ? <span className="opacity-50">cargando...</span>
                  : <span className="font-semibold mono text-[var(--text)]">{currentStock}</span>
                }
              </p>
            )}
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

          {/* Límites de stock */}
          <div className="border-t border-[var(--border)] pt-4 space-y-3">
            <p className="text-xs font-medium text-[var(--text3)]">Límites de alerta</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Stock mínimo"
                type="number"
                min="0"
                step="1"
                value={stockMin}
                onChange={e => setStockMin(e.target.value)}
                placeholder="0"
                hint="Alerta si baja de este valor"
              />
              <Input
                label="Stock máximo"
                type="number"
                min="0"
                step="1"
                value={stockMax}
                onChange={e => setStockMax(e.target.value)}
                placeholder="9999"
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { reset(); onClose() }} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant={type === 'remove' ? 'danger' : 'primary'}
                onClick={handleSave}
                loading={saving}
                disabled={!selectedWarehouseId || newStock < 0}
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
