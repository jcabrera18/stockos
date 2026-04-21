'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Trash2, Plus, ArrowRight } from 'lucide-react'
import type { PriceList } from '@/app/price-lists/page'
import type { Product } from '@/types'

interface PriceRule {
  id:           string
  product_id:   string
  price_list_id: string
  min_quantity: number
  price_lists:  { id: string; name: string; margin_pct: number }
}

interface ProductPriceRulesModalProps {
  open:    boolean
  onClose: () => void
  product: Product | null
}

export function ProductPriceRulesModal({ open, onClose, product }: ProductPriceRulesModalProps) {
  const [rules, setRules]         = useState<PriceRule[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading]     = useState(false)

  // Form nueva regla
  const [newQty, setNewQty]       = useState('')
  const [newList, setNewList]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !product) return
    setLoading(true)
    Promise.all([
      api.get<PriceRule[]>(`/api/products/${product.id}/price-rules`),
      api.get<PriceList[]>('/api/price-lists'),
    ]).then(([r, pl]) => {
      setRules(r)
      setPriceLists(pl)
      if (pl.length > 0) setNewList(pl[0].id)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [open, product])

  useEffect(() => {
    if (!open) { setRules([]); setNewQty(''); setNewList('') }
  }, [open])

  const handleAdd = async () => {
    if (!product) return
    if (!newQty || Number(newQty) < 1) { toast.error('Ingresá una cantidad válida'); return }
    if (!newList) { toast.error('Seleccioná una lista de precio'); return }

    setSaving(true)
    try {
      const rule = await api.post<PriceRule>(`/api/products/${product.id}/price-rules`, {
        price_list_id: newList,
        min_quantity:  Number(newQty),
      })
      setRules(prev => [...prev, rule].sort((a, b) => a.min_quantity - b.min_quantity))
      setNewQty('')
      toast.success('Regla agregada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar regla')
    } finally { setSaving(false) }
  }

  const handleDelete = async (ruleId: string) => {
    if (!product) return
    setDeletingId(ruleId)
    try {
      await api.delete(`/api/products/${product.id}/price-rules/${ruleId}`)
      setRules(prev => prev.filter(r => r.id !== ruleId))
      toast.success('Regla eliminada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeletingId(null) }
  }

  // Simular cómo quedarían los precios con las reglas actuales
  const getPreviewPrice = (costPrice: number, marginPct: number) =>
    Math.round(costPrice * (1 + marginPct / 100) * 100) / 100

  const priceListOptions = priceLists.map(pl => ({
    value: pl.id,
    label: `${pl.name} (+${pl.margin_pct}%)`,
  }))

  // Obtener la lista default para mostrar el precio base
  const defaultList = priceLists.find(pl => pl.is_default)

  if (!product) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reglas de precio — ${product.name}`}
      size="md"
    >
      <div className="space-y-5">

        {/* Info del producto */}
        <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
          <div className="flex justify-between items-center text-sm">
            <span className="text-[var(--text3)]">Precio de costo</span>
            <span className="mono font-semibold text-[var(--text)]">
              ${Number(product.cost_price).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          {defaultList && (
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-[var(--text3)]">Precio base ({defaultList.name})</span>
              <span className="mono font-semibold text-[var(--accent)]">
                ${getPreviewPrice(Number(product.cost_price), defaultList.margin_pct).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        {/* Explicación */}
        <div className="text-xs text-[var(--text3)] px-1">
          Definí desde qué cantidad aplica cada lista. Si no hay regla para un producto, se usa la regla global de la lista.
        </div>

        {/* Reglas existentes */}
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-4 text-sm text-[var(--text3)]">
            Sin reglas específicas — usa la configuración global de listas
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--text3)] mb-2">Reglas activas</p>

            {/* Fila base (siempre presente) */}
            {defaultList && (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-sm opacity-60">
                <span className="text-[var(--text3)] w-20 text-right mono">1+ ud.</span>
                <ArrowRight size={12} className="text-[var(--text3)] flex-shrink-0" />
                <span className="flex-1 text-[var(--text2)]">{defaultList.name}</span>
                <span className="mono text-[var(--text3)]">
                  ${getPreviewPrice(Number(product.cost_price), defaultList.margin_pct).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-[var(--text3)]">(global)</span>
              </div>
            )}

            {/* Reglas específicas del producto */}
            {rules.map(rule => {
              const price = getPreviewPrice(Number(product.cost_price), rule.price_lists.margin_pct)
              return (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-sm group"
                >
                  <span className="text-[var(--text)] font-semibold w-20 text-right mono">
                    {rule.min_quantity}+ ud.
                  </span>
                  <ArrowRight size={12} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="flex-1 font-medium text-[var(--text)]">
                    {rule.price_lists.name}
                    <span className="text-[var(--text3)] font-normal ml-1">(+{rule.price_lists.margin_pct}%)</span>
                  </span>
                  <span className="mono font-semibold text-[var(--accent)]">
                    ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    disabled={deletingId === rule.id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-all"
                  >
                    {deletingId === rule.id
                      ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Agregar nueva regla */}
        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-xs font-medium text-[var(--text3)] mb-3">Agregar regla</p>
          <div className="flex gap-2 items-end">
            <div className="w-28">
              <Input
                label="Desde cant."
                type="number"
                min="1"
                step="1"
                value={newQty}
                onChange={e => setNewQty(e.target.value)}
                placeholder="Ej: 6"
              />
            </div>
            <div className="flex-1">
              <Select
                label="Lista de precio"
                options={priceListOptions}
                value={newList}
                onChange={e => setNewList(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} loading={saving} className="mb-0.5">
              <Plus size={14} /> Agregar
            </Button>
          </div>

          {/* Preview del precio con la nueva regla */}
          {newQty && newList && Number(newQty) >= 1 && (() => {
            const list = priceLists.find(pl => pl.id === newList)
            if (!list) return null
            const price = getPreviewPrice(Number(product.cost_price), list.margin_pct)
            return (
              <div className="mt-2 px-3 py-2 bg-[var(--accent-subtle)] rounded-[var(--radius-md)] text-xs flex justify-between">
                <span className="text-[var(--text2)]">
                  Desde {newQty} unidades → {list.name} (+{list.margin_pct}%)
                </span>
                <span className="mono font-semibold text-[var(--accent)]">
                  ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )
          })()}
        </div>

        <div className="flex justify-end pt-2 pb-1">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>

      </div>
    </Modal>
  )
}
