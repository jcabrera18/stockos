'use client'
import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { Supplier, Product } from '@/types'
import { Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { usePOSSync } from '@/hooks/usePOSSync'
import { searchProductsLocal } from '@/lib/pos-cache'

interface Warehouse { id: string; name: string; is_default: boolean }

const VAT_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '10.5', label: '10,5%' },
  { value: '21', label: '21%' },
  { value: '27', label: '27%' },
]

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string) => Number(String(s).replace(',', '.')) || 0
// Cantidad cruda (string, permite vacío al tipear); para cálculos vale 0 si está vacía.
const qtyOf = (i: OrderItem) => Math.max(0, parseInt(i.quantity, 10) || 0)
const grossCost = (i: OrderItem) => round2((Number(i.unit_cost_net) || 0) * (1 + i.vat_rate / 100))

// Gasto extra (flete/traslado): "%" se calcula sobre el costo NETO (sin IVA) por
// unidad; "$" es un monto fijo por la LÍNEA entera (se prorratea entre unidades).
const extraLine = (i: OrderItem) => {
  const v = num(i.extra_value)
  if (v <= 0) return 0
  return i.extra_mode === 'amount'
    ? v
    : round2(qtyOf(i) * (Number(i.unit_cost_net) || 0) * v / 100)
}
const lineSubtotal   = (i: OrderItem) => round2(qtyOf(i) * grossCost(i) + extraLine(i))
const finalUnitCost  = (i: OrderItem) => qtyOf(i) > 0 ? round2(lineSubtotal(i) / qtyOf(i)) : grossCost(i)

interface OrderItem {
  product: Product
  // String crudo para permitir vaciarlo mientras se tipea (sin forzar "1").
  quantity: string
  // Crudo Number()-safe emitido por MoneyInput ("95", "95.5"). Se guarda como
  // string para preservar el estado decimal mientras se tipea (ej: "95," → "95.").
  unit_cost_net: string
  vat_rate: number
  // Gasto extra por línea: 'pct' = % sobre el neto (por unidad); 'amount' = $ fijo por la línea.
  extra_mode: 'pct' | 'amount'
  extra_value: string
}

interface PurchaseOrderModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function PurchaseOrderModal({ open, onClose, onSaved }: PurchaseOrderModalProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')

  const { user } = useAuth()
  // Catálogo local en IndexedDB (igual que POS/pedidos): la búsqueda de productos
  // resuelve al instante desde el cache. El init es lazy: recién al abrir el modal.
  const { cacheReady } = usePOSSync(null, open)
  const mcEnabled = user?.business?.multicurrency_enabled ?? false
  const usdRate = user?.business?.usd_rate ?? null
  const isUsd = mcEnabled && currency === 'USD'
  // Formatea en la moneda de la orden (US$ para USD, $ para ARS).
  const fmt = (n: number) =>
    isUsd
      ? `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : formatCurrency(n)

  // Búsqueda de productos
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => { })
    api.get<Warehouse[]>('/api/warehouses').then(ws => {
      setWarehouses(ws)
      const def = ws.find(w => w.is_default) ?? ws[0]
      if (def) setWarehouseId(def.id)
    }).catch(() => { })
  }, [open])

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setSupplierId('')
      setWarehouseId('')
      setNotes('')
      setItems([])
      setQuery('')
      setResults([])
      setCurrency('ARS')
    }
  }, [open])

  // Búsqueda de productos
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }

    // Con el cache listo: búsqueda local en IndexedDB (instantánea, sin acentos).
    if (cacheReady) {
      let cancelled = false
      searchProductsLocal(query.trim(), 6).then(local => {
        if (!cancelled) setResults(local.filter(p => !items.find(i => i.product.id === p.id)))
      })
      return () => { cancelled = true }
    }

    // Fallback a la API mientras el cache aún no cargó.
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
  }, [query, items, cacheReady])

  const addItem = (product: Product) => {
    // En USD prellenamos con el costo en dólares del producto (si lo tiene).
    const prefillNet = isUsd
      ? (product.cost_currency === 'USD' ? (product.cost_price_usd ?? 0) : 0)
      : (product.cost_price_net ?? product.cost_price)
    setItems(prev => [...prev, {
      product,
      quantity: '',
      unit_cost_net: prefillNet ? String(prefillNet) : '',
      vat_rate: 0,
      extra_mode: 'pct',
      extra_value: '',
    }])
    setQuery('')
    setResults([])
  }

  const updateItem = (id: string, field: 'quantity' | 'unit_cost_net' | 'vat_rate' | 'extra_value', value: string) => {
    setItems(prev => prev.map(i => {
      if (i.product.id !== id) return i
      // La cantidad se guarda cruda pero solo dígitos (permite vaciarla sin forzar "1").
      if (field === 'quantity') return { ...i, quantity: value.replace(/\D/g, '') }
      // El costo y el gasto extra se guardan crudos (string) para preservar el separador decimal al tipear.
      if (field === 'unit_cost_net' || field === 'extra_value') return { ...i, [field]: value }
      return { ...i, [field]: Math.max(0, Number(value) || 0) }
    }))
  }

  const toggleExtraMode = (id: string) =>
    setItems(prev => prev.map(i =>
      i.product.id === id ? { ...i, extra_mode: i.extra_mode === 'pct' ? 'amount' : 'pct' } : i))

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.product.id !== id))

  const total = items.reduce((a, i) => a + lineSubtotal(i), 0)

  const handleSave = async () => {
    if (items.length === 0) { toast.error('Agregá al menos un producto'); return }
    if (items.some(i => qtyOf(i) < 1)) { toast.error('Ingresá la cantidad de cada producto'); return }
    if (isUsd && (!usdRate || usdRate <= 0)) {
      toast.error('Configurá la cotización del dólar en Ajustes antes de cargar una compra en USD')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/purchases', {
        supplier_id:  supplierId || null,
        warehouse_id: warehouseId || null,
        notes: notes.trim() || null,
        ...(mcEnabled ? { currency, ...(isUsd && usdRate ? { usd_rate: usdRate } : {}) } : {}),
        items: items.map(i => ({
          product_id: i.product.id,
          quantity:   Math.max(1, qtyOf(i)),
          // Costo puesto: c/IVA + gasto extra (flete). Va al promedio ponderado del backend.
          unit_cost:  finalUnitCost(i),
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
    <Modal open={open} onClose={onClose} title="Nueva orden de compra" size="2xl">
      <div className="space-y-5">

        {/* Proveedor + depósito + notas */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Proveedor"
            options={suppliers.map(s => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            placeholder="Sin proveedor"
          />
          <Select
            label="Depósito destino"
            options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            placeholder="Sin depósito"
          />
        </div>
        {mcEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Moneda de la compra"
              options={[{ value: 'ARS', label: 'Pesos (ARS)' }, { value: 'USD', label: 'Dólares (USD)' }]}
              value={currency}
              onChange={e => setCurrency(e.target.value as 'ARS' | 'USD')}
            />
            {isUsd && (
              <div className="flex flex-col justify-end">
                <p className="text-xs text-[var(--text3)] pb-2">
                  {usdRate
                    ? `Cotización: $${usdRate.toLocaleString('es-AR')} — el gasto se registra en pesos.`
                    : 'Configurá la cotización del dólar en Ajustes.'}
                </p>
              </div>
            )}
          </div>
        )}
        <Input
          label="Notas"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Observaciones opcionales..."
        />

        {/* Buscador de productos */}
        <div>
          <label className="text-sm font-medium text-[var(--text2)] block mb-1">Agregar productos</label>
          {/* El dropdown flota (absolute) para no empujar el resto del modal. */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-[19px] -translate-y-1/2 text-[var(--text3)] z-10" />
            {searching && (
              <div className="absolute right-3 top-[19px] -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin z-10" />
            )}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />

            {/* Resultados */}
            {results.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-y-auto bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg">
                {results.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addItem(p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface2)] transition-colors text-left border-b border-[var(--border)] last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--text3)]">Stock actual: {p.stock_current}</p>
                    </div>
                    <div className="text-right whitespace-nowrap pl-3">
                      <p className="text-xs text-[var(--text3)]">Costo anterior</p>
                      <p className="text-sm mono font-medium text-[var(--text)]">{formatCurrency(p.cost_price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Sin resultados */}
            {query.trim() && !searching && results.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg">
                <p className="text-sm text-[var(--text2)]">
                  No se encontró ningún producto con “{query.trim()}”.
                </p>
                <p className="text-xs text-[var(--text3)] mt-0.5">
                  Si el producto no existe todavía, cargalo primero desde la sección{' '}
                  <a href="/products" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] font-medium hover:underline">
                    Productos
                  </a>{' '}y después agregalo a la compra.
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-[var(--text3)] mt-1.5">
            Solo podés comprar productos ya cargados. ¿No aparece? Cargalo desde{' '}
            <a href="/products" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] font-medium hover:underline">
              Productos
            </a>.
          </p>
        </div>

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-2 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">Cantidad</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">Costo neto</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">IVA</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">Gasto extra</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">Costo final</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-[var(--text3)]">Subtotal</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {items.map(item => (
                  <tr key={item.product.id}>
                    <td className="px-2 py-2 align-middle">
                      <p className="font-medium text-[var(--text)] whitespace-nowrap">{item.product.name}</p>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.quantity}
                        onChange={e => updateItem(item.product.id, 'quantity', e.target.value)}
                        placeholder="0"
                        className="w-16 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-[var(--text3)]">{isUsd ? 'US$' : '$'}</span>
                        <MoneyInput
                          unstyled
                          value={item.unit_cost_net}
                          onChange={v => updateItem(item.product.id, 'unit_cost_net', v)}
                          className="w-24 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <select
                        value={String(item.vat_rate)}
                        onChange={e => updateItem(item.product.id, 'vat_rate', e.target.value)}
                        className="text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                      >
                        {VAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.extra_value}
                          onChange={e => updateItem(item.product.id, 'extra_value', e.target.value)}
                          placeholder="0"
                          className="w-14 text-sm mono text-right bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={() => toggleExtraMode(item.product.id)}
                          title={item.extra_mode === 'pct' ? '% sobre el costo neto' : '$ fijo por la línea'}
                          className="w-7 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        >
                          {item.extra_mode === 'pct' ? '%' : (isUsd ? 'US$' : '$')}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right mono text-[var(--text2)] whitespace-nowrap tabular-nums">
                      {fmt(finalUnitCost(item))}
                    </td>
                    <td className="px-2 py-2 text-right mono font-semibold text-[var(--text)] whitespace-nowrap tabular-nums">
                      {fmt(lineSubtotal(item))}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => removeItem(item.product.id)} className="text-[var(--text3)] hover:text-[var(--danger)]">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td colSpan={6} className="px-2 py-2.5 text-sm font-semibold text-[var(--text)]">
                    Total{isUsd ? ' (USD)' : ''}
                  </td>
                  <td className="px-2 py-2.5 text-right mono text-base font-bold text-[var(--accent)] whitespace-nowrap tabular-nums">
                    {fmt(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
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
