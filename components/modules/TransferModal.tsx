'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Plus, Trash2, ArrowRight } from 'lucide-react'
import type { Product } from '@/types'

interface Warehouse {
  id: string
  name: string
  is_default: boolean
}

interface TransferItem {
  product: Product
  quantity: number
}

interface TransferModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  warehouses: Warehouse[]
}

export function TransferModal({ open, onClose, onSaved, warehouses }: TransferModalProps) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransferItem[]>([])
  const [saving, setSaving] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) { setFromId(''); setToId(''); setNotes(''); setItems([]); setQuery(''); setResults([]) }
  }, [open])

  useEffect(() => {
    if (!query.trim() || !fromId) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        // Buscar stock disponible en el depósito origen
        const res = await api.get<{ data: { product_id: string; product_name: string; stock_current: number; barcode?: string }[] }>(
          `/api/warehouses/${fromId}/stock`, { search: query.trim(), limit: 6 }
        )
        // Convertir a formato Product simplificado
        setResults(res.data
          .filter(s => !items.find(i => i.product.id === s.product_id))
          .map(s => ({ id: s.product_id, name: s.product_name, stock_current: s.stock_current, barcode: s.barcode } as Product))
        )
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, fromId, items])

  const addItem = (product: Product) => {
    setItems(prev => [...prev, { product, quantity: 1 }])
    setQuery('')
    setResults([])
  }

  const updateQty = (id: string, value: string) => {
    setItems(prev => prev.map(i =>
      i.product.id === id ? { ...i, quantity: Math.max(1, Number(value) || 1) } : i
    ))
  }

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.product.id !== id))

  const handleSave = async () => {
    if (!fromId) { toast.error('Seleccioná el depósito origen'); return }
    if (!toId) { toast.error('Seleccioná el depósito destino'); return }
    if (fromId === toId) { toast.error('El origen y destino no pueden ser el mismo'); return }
    if (items.length === 0) { toast.error('Agregá al menos un producto'); return }

    setSaving(true)
    try {
      await api.post('/api/warehouses/transfer', {
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        items: items.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
        notes: notes.trim() || null,
      })
      toast.success('Transferencia creada — pendiente de aprobación')
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al transferir')
    } finally { setSaving(false) }
  }

  const warehouseOptions = warehouses.map(w => ({ value: w.id, label: w.name }))
  const toOptions = warehouseOptions.filter(w => w.value !== fromId)

  return (
    <Modal open={open} onClose={onClose} title="Transferencia entre depósitos" size="lg">
      <div className="space-y-5">

        {/* Origen → Destino */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select label="Depósito origen *" options={warehouseOptions}
              value={fromId} onChange={e => { setFromId(e.target.value); setItems([]) }}
              placeholder="Seleccionar..." />
          </div>
          <div className="pt-5 flex-shrink-0">
            <ArrowRight size={18} className="text-[var(--text3)]" />
          </div>
          <div className="flex-1">
            <Select label="Depósito destino *" options={toOptions}
              value={toId} onChange={e => setToId(e.target.value)}
              placeholder="Seleccionar..." />
          </div>
        </div>

        {/* Buscador de productos */}
        {fromId && (
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-1">Agregar productos</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar producto en el depósito origen..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {results.length > 0 && (
              <div className="mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-lg">
                {results.map(p => (
                  <button key={p.id} onClick={() => addItem(p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
                      {p.barcode && <p className="text-xs mono text-[var(--text3)]">{p.barcode}</p>}
                    </div>
                    <span className="text-xs text-[var(--accent)] font-medium">Stock: {p.stock_current}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Disponible</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cantidad a transferir</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map(item => (
                  <tr key={item.product.id}>
                    <td className="px-3 py-2.5 font-medium text-[var(--text)]">{item.product.name}</td>
                    <td className="px-3 py-2.5 text-right mono text-[var(--text3)]">{item.product.stock_current}</td>
                    <td className="px-3 py-2.5 text-right">
                      <input type="number" min="1" max={item.product.stock_current}
                        value={item.quantity}
                        onChange={e => updateQty(item.product.id, e.target.value)}
                        className="w-20 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => removeItem(item.product.id)}
                        className="text-[var(--text3)] hover:text-[var(--danger)]">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Input label="Notas" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Motivo de la transferencia (opcional)" />

        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} disabled={items.length === 0}>
              Crear transferencia
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
