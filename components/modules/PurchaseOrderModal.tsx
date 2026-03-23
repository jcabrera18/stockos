'use client'
import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Supplier, Product } from '@/types'
import { Search, Plus, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface OrderItem {
  product: Product
  quantity: number
  unit_cost: number
}

interface PurchaseOrderModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function PurchaseOrderModal({ open, onClose, onSaved }: PurchaseOrderModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [saving, setSaving] = useState(false)

  // Búsqueda de productos
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => { })
  }, [open])

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setSupplierId('')
      setNotes('')
      setItems([])
      setQuery('')
      setResults([])
    }
  }, [open])

  // Búsqueda de productos con debounce
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.get<{ data: Product[] }>('/api/products', {
          search: query.trim(), limit: 6,
        })
        setResults(res.data.filter(p => !items.find(i => i.product.id === p.id)))
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, items])

  const addItem = (product: Product) => {
    setItems(prev => [...prev, {
      product,
      quantity: 1,
      unit_cost: product.cost_price,
    }])
    setQuery('')
    setResults([])
  }

  const updateItem = (id: string, field: 'quantity' | 'unit_cost', value: string) => {
    setItems(prev => prev.map(i =>
      i.product.id === id
        ? { ...i, [field]: Math.max(field === 'quantity' ? 1 : 0, Number(value) || 0) }
        : i
    ))
  }

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.product.id !== id))

  const total = items.reduce((a, i) => a + i.quantity * i.unit_cost, 0)

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Agregá al menos un producto'); return }
    setSaving(true)
    try {
      await api.post('/api/purchases', {
        supplier_id: supplierId || null,
        notes: notes.trim() || null,
        items: items.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
        })),
      })
      toast.success('Orden de compra creada')
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear la orden')
    } finally {
      setSaving(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))

  return (
    <Modal open={open} onClose={onClose} title="Nueva orden de compra" size="xl">
      <div className="space-y-5">

        {/* Proveedor + notas */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Proveedor"
            options={supplierOptions}
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            placeholder="Sin proveedor"
          />
          <Input
            label="Notas"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observaciones opcionales..."
          />
        </div>

        {/* Buscador de productos */}
        <div>
          <label className="text-sm font-medium text-[var(--text2)] block mb-1">Agregar productos</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            )}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Resultados */}
          {results.length > 0 && (
            <div className="mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-lg">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => addItem(p)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
                    <p className="text-xs text-[var(--text3)]">Stock actual: {p.stock_current}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--text3)]">Costo anterior</p>
                    <p className="text-sm mono font-medium text-[var(--text)]">{formatCurrency(p.cost_price)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Cantidad</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Precio costo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Subtotal</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map(item => (
                  <tr key={item.product.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--text)]">{item.product.name}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(item.product.id, 'quantity', e.target.value)}
                        className="w-16 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-[var(--text3)]">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={e => updateItem(item.product.id, 'unit_cost', e.target.value)}
                          className="w-24 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right mono font-semibold text-[var(--text)]">
                      {formatCurrency(item.quantity * item.unit_cost)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => removeItem(item.product.id)} className="text-[var(--text3)] hover:text-[var(--danger)]">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold text-[var(--text)]">Total</td>
                  <td className="px-3 py-2.5 text-right mono font-bold text-[var(--accent)]">
                    {formatCurrency(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Acciones */}
        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving} disabled={items.length === 0}>
              Crear orden
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
