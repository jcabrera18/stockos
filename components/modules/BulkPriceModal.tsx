'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Supplier  { id: string; name: string }
interface Category  { id: string; name: string; parent_id?: string }

interface PriceChange {
  id:            string
  name:          string
  category_name: string | null
  supplier_name: string | null
  old_cost:      number
  new_cost:      number
  old_sell:      number
  new_sell:      number
  margin_pct:    number
  diff_cost_pct: number
}

interface PreviewResult {
  preview:        boolean
  total_products: number
  changes:        PriceChange[]
  summary: {
    avg_cost_increase: number
    rounding:          string
    filter:            string
  }
}

interface BulkPriceModalProps {
  open:      boolean
  onClose:   () => void
  onApplied: () => void
}

const ROUNDING_OPTIONS = [
  { value: 'none', label: 'Sin redondeo' },
  { value: '99',   label: 'Terminar en ,99 (ej: $199,99)' },
  { value: '00',   label: 'Número entero (ej: $200)' },
  { value: '50',   label: 'Terminar en ,50 o entero (ej: $199,50)' },
]

const FILTER_OPTIONS = [
  { value: 'all',      label: 'Todos los productos' },
  { value: 'category', label: 'Por categoría' },
  { value: 'supplier', label: 'Por proveedor' },
]

export function BulkPriceModal({ open, onClose, onApplied }: BulkPriceModalProps) {
  const [filter, setFilter]           = useState<'all' | 'category' | 'supplier'>('all')
  const [categoryId, setCategoryId]   = useState('')
  const [supplierId, setSupplierId]   = useState('')
  const [pctIncrease, setPctIncrease] = useState('')
  const [rounding, setRounding]       = useState<'none' | '99' | '00' | '50'>('99')
  const [categories, setCategories]   = useState<Category[]>([])
  const [suppliers, setSuppliers]     = useState<Supplier[]>([])

  const [step, setStep]               = useState<'config' | 'preview' | 'done'>('config')
  const [preview, setPreview]         = useState<PreviewResult | null>(null)
  const [loading, setLoading]         = useState(false)
  const [applying, setApplying]       = useState(false)

  useEffect(() => {
    if (!open) return
    Promise.all([
      api.get<Category[]>('/api/products/categories'),
      api.get<Supplier[]>('/api/purchases/suppliers'),
    ]).then(([cats, sups]) => {
      setCategories(cats)
      setSuppliers(sups)
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) {
      setFilter('all'); setCategoryId(''); setSupplierId('')
      setPctIncrease(''); setRounding('99')
      setStep('config'); setPreview(null)
    }
  }, [open])

  const handlePreview = async () => {
    if (!pctIncrease || isNaN(Number(pctIncrease))) {
      toast.error('Ingresá un porcentaje válido')
      return
    }
    if (filter === 'category' && !categoryId) { toast.error('Seleccioná una categoría'); return }
    if (filter === 'supplier' && !supplierId) { toast.error('Seleccioná un proveedor'); return }

    setLoading(true)
    try {
      const res = await api.post<PreviewResult>('/api/products/bulk-prices', {
        category_id:       filter === 'category' ? categoryId : null,
        supplier_id:       filter === 'supplier' ? supplierId : null,
        cost_increase_pct: Number(pctIncrease),
        rounding,
        preview:           true,
      })
      setPreview(res)
      setStep('preview')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al calcular precios')
    } finally { setLoading(false) }
  }

  const handleApply = async () => {
    if (!preview) return
    setApplying(true)
    try {
      const res = await api.post<PreviewResult>('/api/products/bulk-prices', {
        category_id:       filter === 'category' ? categoryId : null,
        supplier_id:       filter === 'supplier' ? supplierId : null,
        cost_increase_pct: Number(pctIncrease),
        rounding,
        preview:           false,
      })
      toast.success(`✓ ${res.total_products} productos actualizados`)
      setStep('done')
      onApplied()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al aplicar precios')
    } finally { setApplying(false) }
  }

  const pct = Number(pctIncrease) || 0
  const isIncrease = pct >= 0

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Actualización masiva de precios"
      size="lg"
    >

      {/* ── Paso 1: Configuración ── */}
      {step === 'config' && (
        <div className="space-y-5">

          {/* Banner informativo */}
          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)] text-xs text-[var(--accent)]">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Esta operación actualiza el <strong>precio de costo</strong> de los productos y recalcula el <strong>precio de venta</strong> manteniendo el margen actual de cada producto.
            </span>
          </div>

          {/* Filtro */}
          <div>
            <Select
              label="Aplicar a"
              options={FILTER_OPTIONS}
              value={filter}
              onChange={e => { setFilter(e.target.value as typeof filter); setCategoryId(''); setSupplierId('') }}
            />
          </div>

          {filter === 'category' && (
            <Select
              label="Categoría *"
              options={categoryOptions}
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              placeholder="Seleccionar categoría..."
            />
          )}

          {filter === 'supplier' && (
            <Select
              label="Proveedor *"
              options={supplierOptions}
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              placeholder="Seleccionar proveedor..."
            />
          )}

          {/* Porcentaje */}
          <div>
            <Input
              label="Porcentaje de ajuste sobre el costo *"
              type="number"
              step="0.1"
              value={pctIncrease}
              onChange={e => setPctIncrease(e.target.value)}
              placeholder="Ej: 12 para subir 12%, -5 para bajar 5%"
              hint="Usá valores negativos para bajar precios"
            />
            {pctIncrease && !isNaN(Number(pctIncrease)) && (
              <div className={`mt-2 flex items-center gap-2 text-sm font-medium ${isIncrease ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                {isIncrease ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {isIncrease ? `Subida del ${pct}% sobre el costo` : `Baja del ${Math.abs(pct)}% sobre el costo`}
              </div>
            )}
          </div>

          {/* Redondeo */}
          <Select
            label="Redondeo del precio de venta"
            options={ROUNDING_OPTIONS}
            value={rounding}
            onChange={e => setRounding(e.target.value as typeof rounding)}
          />

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-2 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={handlePreview} loading={loading} disabled={!pctIncrease}>
                Ver precios nuevos →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Paso 2: Preview ── */}
      {step === 'preview' && preview && (
        <div className="space-y-4">

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2.5 text-center">
              <p className="text-2xl font-bold mono text-[var(--text)]">{preview.total_products}</p>
              <p className="text-xs text-[var(--text3)] mt-0.5">productos afectados</p>
            </div>
            <div className={`rounded-[var(--radius-md)] px-3 py-2.5 text-center ${pct >= 0 ? 'bg-[var(--danger-subtle)]' : 'bg-[var(--accent-subtle)]'}`}>
              <p className={`text-2xl font-bold mono ${pct >= 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                {pct >= 0 ? '+' : ''}{pct}%
              </p>
              <p className="text-xs text-[var(--text3)] mt-0.5">ajuste de costo</p>
            </div>
            <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2.5 text-center">
              <p className="text-sm font-semibold text-[var(--text)] mt-1">
                {ROUNDING_OPTIONS.find(r => r.value === rounding)?.label.split(' ')[0]}
              </p>
              <p className="text-xs text-[var(--text3)] mt-0.5">redondeo</p>
            </div>
          </div>

          {/* Advertencia */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-[var(--warning-subtle,#fffbeb)] border border-[var(--warning,#f59e0b)] rounded-[var(--radius-md)] text-xs text-[var(--warning,#b45309)]">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>Esta acción actualizará <strong>{preview.total_products} productos</strong>. Revisá la lista antes de confirmar — no se puede deshacer automáticamente.</span>
          </div>

          {/* Tabla de cambios */}
          <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface2)] z-10">
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs font-medium text-[var(--text3)]">Producto</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Costo actual</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Costo nuevo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Venta actual</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Venta nueva</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-[var(--text3)]">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {preview.changes.map(c => (
                  <tr key={c.id} className="hover:bg-[var(--surface)] transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-[var(--text)] text-xs">{c.name}</p>
                      {c.supplier_name && (
                        <p className="text-xs text-[var(--text3)]">{c.supplier_name}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-xs text-[var(--text3)]">
                      {formatCurrency(c.old_cost)}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-xs font-semibold text-[var(--danger)]">
                      {formatCurrency(c.new_cost)}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-xs text-[var(--text3)]">
                      {formatCurrency(c.old_sell)}
                    </td>
                    <td className="px-3 py-2.5 text-right mono text-xs font-bold text-[var(--text)]">
                      {formatCurrency(c.new_sell)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-xs text-[var(--accent)]">{c.margin_pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-2 border-t border-[var(--border)]">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep('config')}
                className="text-sm text-[var(--text3)] hover:text-[var(--text)] transition-colors"
              >
                ← Modificar configuración
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button onClick={handleApply} loading={applying}>
                  Actualizar {preview.total_products} productos
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Paso 3: Confirmación ── */}
      {step === 'done' && preview && (
        <div className="flex flex-col items-center py-8 space-y-4">
          <div className="w-14 h-14 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center">
            <CheckCircle size={28} className="text-[var(--accent)]" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-[var(--text)]">
              {preview.total_products} productos actualizados
            </p>
            <p className="text-sm text-[var(--text3)] mt-1">
              Los precios de venta ya están activos en el POS
            </p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}

    </Modal>
  )
}
