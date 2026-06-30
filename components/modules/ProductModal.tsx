'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, X, ChevronDown } from 'lucide-react'
import type { Product, Category, Supplier } from '@/types'
import { CategoryTreePicker } from '@/components/ui/CategoryTreePicker'
import type { PriceList } from '@/app/price-lists/page'
import { SupplierModal } from '@/components/modules/SupplierModal'

interface ProductModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  product?: Product | null
}

const UNITS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'litro', label: 'Litro' },
  { value: 'gramo', label: 'Gramo' },
  { value: 'metro', label: 'Metro' },
  { value: 'caja', label: 'Caja' },
  { value: 'pack', label: 'Pack' },
]

const VAT_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '10.5', label: '10,5%' },
  { value: '21', label: '21%' },
  { value: '27', label: '27%' },
]

interface CostHistoryEntry {
  id:                string
  supplier_id:       string | null
  purchase_order_id: string | null
  unit_cost:         number
  applied_cost:      number
  decision:          string
  recorded_at:       string
  suppliers?:        { name: string } | null
}

const DECISION_LABELS: Record<string, string> = {
  keep:      'Mantener actual',
  new_price: 'Precio orden',
  weighted:  'Prom. pond.',
  highest:   'Mayor precio',
}

const _refCache: {
  categories: Category[] | null
  suppliers:  Supplier[] | null
  priceLists: import('@/app/price-lists/page').PriceList[] | null
  brands:     { id: string; name: string }[] | null
} = { categories: null, suppliers: null, priceLists: null, brands: null }

const emptyForm = {
  name: '',
  sku: '',
  description: '',
  category_id: '',
  supplier_id: '',
  brand_id: '',
  cost_price_net: '',
  vat_rate: '21',
  sell_price: '',
  initial_stock: '0',
  stock_min: '0',
  stock_max: '9999',
  use_fixed_sell_price: true,
  unit: 'unidad',
  price_mode: 'fixed' as 'fixed' | 'custom',
}

const PRICE_MODES = [
  { value: 'fixed' as const, label: 'Precio fijo',   hint: 'Vos definís el precio' },
  { value: 'list'  as const, label: 'Por lista',     hint: 'Margen sobre costo' },
  { value: 'libre' as const, label: 'Precio libre',  hint: 'Cajero lo ingresa' },
]

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text3)]">
      {children}
    </p>
  )
}

export function ProductModal({ open, onClose, onSaved, product }: ProductModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [newBarcode, setNewBarcode] = useState('')
  const [selectedBarcodeIdx, setSelectedBarcodeIdx] = useState<number>(0)
  const newBarcodeRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const costPriceRef = useRef<HTMLInputElement>(null)
  const sellPriceRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  // overridePrices: precio manual por lista (price_list_id → valor string editable)
  const [overridePrices, setOverridePrices] = useState<Record<string, string>>({})
  const [overrideModes, setOverrideModes] = useState<Record<string, 'pesos' | 'pct'>>({})
  const [overridePctValues, setOverridePctValues] = useState<Record<string, string>>({})
  const [supplierSubModal, setSupplierSubModal] = useState(false)
  const [brandSubModal, setBrandSubModal] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)
  const [categorySubModal, setCategorySubModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  const [costHistoryOpen, setCostHistoryOpen]       = useState(false)
  const [costHistory, setCostHistory]               = useState<CostHistoryEntry[]>([])
  const [costHistoryLoading, setCostHistoryLoading] = useState(false)

  const [minimized, setMinimized] = useState(false)
  const [expressMode, setExpressMode] = useState(true)
  const isEdit = !!product
  const costNet = Number(form.cost_price_net) || 0
  const vatRate = Number(form.vat_rate) || 0
  const costWithVat = Math.round(costNet * (1 + vatRate / 100) * 100) / 100

  const currentPriceMode = form.price_mode === 'custom' ? 'libre' : form.use_fixed_sell_price ? 'fixed' : 'list'

  const setPriceMode = (mode: 'list' | 'fixed' | 'libre') => {
    if (mode === 'libre')  setForm(f => ({ ...f, price_mode: 'custom', use_fixed_sell_price: false }))
    else if (mode === 'fixed') setForm(f => ({ ...f, price_mode: 'fixed', use_fixed_sell_price: true }))
    else setForm(f => ({ ...f, price_mode: 'fixed', use_fixed_sell_price: false }))
  }

  // Alt+F para toggle precio fijo (solo cuando el modal está abierto)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setForm(f => ({
          ...f,
          use_fixed_sell_price: !f.use_fixed_sell_price,
          sell_price: f.use_fixed_sell_price ? '' : f.sell_price,
        }))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) {
      setMinimized(false)
      setExpressMode(!product)
    } else {
      setCostHistoryOpen(false)
      setCostHistory([])
    }
  }, [open, product])

  const handleCostHistoryToggle = async () => {
    if (costHistoryOpen) { setCostHistoryOpen(false); return }
    setCostHistoryOpen(true)
    if (costHistory.length > 0 || costHistoryLoading) return
    setCostHistoryLoading(true)
    try {
      const data = await api.get<CostHistoryEntry[]>(
        `/api/purchases/product-cost-history/${product!.id}`
      )
      setCostHistory(data)
    } catch { toast.error('Error al cargar historial de costos') }
    finally { setCostHistoryLoading(false) }
  }

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const [cats, sups, lists, brnds] = await Promise.all([
        _refCache.categories ?? api.get<Category[]>('/api/products/categories'),
        _refCache.suppliers  ?? api.get<Supplier[]>('/api/purchases/suppliers'),
        _refCache.priceLists ?? api.get<PriceList[]>('/api/price-lists'),
        _refCache.brands     ?? api.get<{ id: string; name: string }[]>('/api/brands'),
      ])
      _refCache.categories = cats; setCategories(cats)
      _refCache.suppliers  = sups; setSuppliers(sups)
      _refCache.priceLists = lists; setPriceLists(lists)
      _refCache.brands     = brnds; setBrands(brnds)
      if (!product && lists.length === 0) {
        setForm(f => ({ ...f, use_fixed_sell_price: true }))
      }
    }
    load().catch(() => {})
  }, [open])

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? '',
        description: product.description ?? '',
        category_id: product.category_id ?? '',
        supplier_id: product.supplier_id ?? '',
        brand_id: (product as Product & { brand_id?: string }).brand_id ?? '',
        cost_price_net: String(product.cost_price_net ?? product.cost_price ?? 0),
        vat_rate: String(product.vat_rate ?? 0),
        sell_price: product.use_fixed_sell_price ? String(product.sell_price) : '',
        initial_stock: String(product.stock_current ?? 0),
        stock_min: String(product.stock_min ?? 0),
        stock_max: String(product.stock_max ?? 9999),
        use_fixed_sell_price: product.use_fixed_sell_price ?? false,
        unit: product.unit,
        price_mode: product.price_mode ?? 'fixed',
      })
      api.get<Product & { price_overrides?: { price_list_id: string; price: number }[] }>(`/api/products/${product.id}`)
        .then(full => {
          const bars = (full.product_barcodes ?? []).map(b => b.barcode)
          setBarcodes(bars.length > 0 ? bars : (full.barcode ? [full.barcode] : []))
          const ovMap: Record<string, string> = {}
          for (const ov of (full.price_overrides ?? [])) {
            ovMap[ov.price_list_id] = String(ov.price)
          }
          setOverridePrices(ovMap)
        })
        .catch(() => { setBarcodes(product.barcode ? [product.barcode] : []) })
    } else {
      setForm(emptyForm)
      setBarcodes([])
      setOverridePrices({})
      setOverrideModes({})
      setOverridePctValues({})
    }
    setNewBarcode('')
    setErrors({})
  }, [product, open])

  const addBarcode = (overrideVal?: string) => {
    const val = (overrideVal ?? newBarcode).replace(/\D/g, '')
    if (!val) return
    if (barcodes.includes(val)) { toast.error('Ese código ya está cargado'); return }
    setBarcodes(prev => [...prev, val])
    setNewBarcode('')
    newBarcodeRef.current?.focus()
  }

  const handleBarcodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!pasted) return
    e.preventDefault()
    addBarcode(pasted)
    setTimeout(() => nameInputRef.current?.focus(), 30)
  }

  const handleSaveAndNew = async () => {
    // No guardar el producto si hay un sub-modal de creación abierto (ej. el Enter
    // para crear categoría/marca/proveedor no debe disparar el guardado de atrás).
    if (categorySubModal || brandSubModal || supplierSubModal) return
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSaving(true)
    try {
      let sellPrice: number
      if (form.use_fixed_sell_price && Number(form.sell_price) > 0) {
        sellPrice = Number(form.sell_price)
      } else {
        const defaultList = priceLists.find(l => l.is_default) ?? priceLists[0]
        sellPrice = defaultList
          ? Math.round(costWithVat * (1 + defaultList.margin_pct / 100) * 100) / 100
          : costWithVat
      }
      const payload = {
        name: form.name.trim(),
        barcodes,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        brand_id: form.brand_id || null,
        cost_price: costWithVat,
        cost_price_net: costNet,
        vat_rate: vatRate,
        cost_price_with_vat: costWithVat,
        sell_price: sellPrice,
        use_fixed_sell_price: form.use_fixed_sell_price,
        initial_stock: Number(form.initial_stock) || 0,
        stock_min: Number(form.stock_min) || 0,
        stock_max: Number(form.stock_max) || 0,
        unit: form.unit,
        price_mode: form.price_mode,
      }
      const created = await api.post<{ id: string }>('/api/products', payload)
      const overridePayload = Object.entries(overridePrices)
        .filter(([, v]) => v !== '' && Number(v) > 0)
        .map(([price_list_id, price]) => ({ price_list_id, price: Number(price) }))
      if (overridePayload.length > 0) {
        await api.put(`/api/products/${created.id}/price-overrides`, overridePayload)
      }
      toast.success('Producto creado')
      onSaved()
      setForm(emptyForm)
      setBarcodes([])
      setNewBarcode('')
      setErrors({})
      setOverridePrices({})
      setTimeout(() => newBarcodeRef.current?.focus(), 50)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const removeBarcode = (idx: number) => {
    setBarcodes(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setSelectedBarcodeIdx(Math.min(idx, next.length - 1))
      return next
    })
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    if (Number(form.cost_price_net) < 0) errs.cost_price_net = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_min) < 0) errs.stock_min = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_max) < 0) errs.stock_max = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_max) < Number(form.stock_min)) errs.stock_max = 'Debe ser mayor o igual al stock minimo'
    return errs
  }

  const handleSave = async () => {
    // Ver nota en handleSaveAndNew: no guardar mientras se crea categoría/marca/proveedor.
    if (categorySubModal || brandSubModal || supplierSubModal) return
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      let sellPrice: number
      if (form.use_fixed_sell_price && Number(form.sell_price) > 0) {
        sellPrice = Number(form.sell_price)
      } else {
        const defaultList = priceLists.find(l => l.is_default) ?? priceLists[0]
        sellPrice = defaultList
          ? Math.round(costWithVat * (1 + defaultList.margin_pct / 100) * 100) / 100
          : costWithVat
      }

      const payload = {
        name: form.name.trim(),
        barcodes,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        brand_id: form.brand_id || null,
        cost_price: costWithVat,
        cost_price_net: costNet,
        vat_rate: vatRate,
        cost_price_with_vat: costWithVat,
        sell_price: sellPrice,
        use_fixed_sell_price: form.use_fixed_sell_price,
        initial_stock: Number(form.initial_stock) || 0,
        stock_min: Number(form.stock_min) || 0,
        stock_max: Number(form.stock_max) || 0,
        unit: form.unit,
        price_mode: form.price_mode,
      }

      const overridePayload = Object.entries(overridePrices)
        .filter(([, v]) => v !== '' && Number(v) > 0)
        .map(([price_list_id, price]) => ({ price_list_id, price: Number(price) }))

      if (isEdit) {
        await api.patch(`/api/products/${product!.id}`, payload)
        await api.put(`/api/products/${product!.id}/price-overrides`, overridePayload)
        toast.success('Producto actualizado')
      } else {
        const created = await api.post<{ id: string }>('/api/products', payload)
        if (overridePayload.length > 0) {
          await api.put(`/api/products/${created.id}/price-overrides`, overridePayload)
        }
        toast.success('Producto creado')
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const brandOptions = brands.map(b => ({ value: b.id, label: b.name }))

  const handleSupplierSaved = async () => {
    const prevIds = new Set(suppliers.map(s => s.id))
    const updated = await api.get<Supplier[]>('/api/purchases/suppliers').catch(() => suppliers)
    setSuppliers(updated)
    const newOne = updated.find(s => !prevIds.has(s.id))
    if (newOne) setForm(f => ({ ...f, supplier_id: newOne.id }))
    setSupplierSubModal(false)
  }

  const handleBrandQuickSave = async () => {
    if (!newBrandName.trim()) return
    setSavingBrand(true)
    try {
      const created = await api.post<{ id: string; name: string }>('/api/brands', { name: newBrandName.trim() })
      const updated = await api.get<{ id: string; name: string }[]>('/api/brands').catch(() => brands)
      _refCache.brands = updated
      setBrands(updated)
      setForm(f => ({ ...f, brand_id: created.id }))
      setNewBrandName('')
      setBrandSubModal(false)
      toast.success('Marca creada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear marca')
    } finally {
      setSavingBrand(false)
    }
  }

  const handleCategoryQuickSave = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const created = await api.post<Category>('/api/products/categories', {
        name: newCatName.trim(),
        parent_id: newCatParent || null,
      })
      const refetched = await api.get<Category[]>('/api/products/categories').catch(() => categories)
      // El refetch puede devolver una lista cacheada/replicada sin la categoría recién
      // creada. La insertamos optimistamente para que el breadcrumb no quede colgado.
      const updated = refetched.some(c => c.id === created.id) ? refetched : [...refetched, created]
      _refCache.categories = updated
      setCategories(updated)
      setForm(f => ({ ...f, category_id: created.id }))
      setNewCatName('')
      setNewCatParent('')
      setCategorySubModal(false)
      toast.success('Categoría creada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear categoría')
    } finally {
      setSavingCat(false)
    }
  }

  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const childrenMap = new Map<string | null, Category[]>()
  categories.forEach(c => {
    const key = c.parent_id ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(c)
  })

  const selectClass = 'w-full px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  const renderBarcodeField = (autoFocus?: boolean) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--text2)]">Código de barras (EAN)</label>
      {barcodes.length > 0 && (
        <div className="flex gap-1 mb-1">
          <select
            value={selectedBarcodeIdx}
            onChange={e => setSelectedBarcodeIdx(Number(e.target.value))}
            className="flex-1 min-w-0 px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors mono"
          >
            {barcodes.map((b, i) => (
              <option key={i} value={i}>{b}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeBarcode(selectedBarcodeIdx)}
            className="flex-shrink-0 px-2 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--danger,#ef4444)] hover:bg-[var(--surface2)] transition-colors"
            title="Eliminar código seleccionado"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex gap-1">
        <input
          ref={newBarcodeRef}
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={newBarcode}
          onChange={e => setNewBarcode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBarcode()
              if (expressMode && !isEdit) {
                setTimeout(() => nameInputRef.current?.focus(), 30)
              }
            }
          }}
          onPaste={handleBarcodePaste}
          placeholder="7790895000152"
          className="flex-1 min-w-0 px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors mono"
        />
        <button
          type="button"
          onClick={() => addBarcode()}
          className="flex-shrink-0 px-2 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors"
          title="Agregar código"
        >
          <Plus size={14} />
        </button>
      </div>
      <p className="text-xs text-[var(--text3)]">Escaneá o pegá el código</p>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar producto' : 'Nuevo producto'}
      size={expressMode && !isEdit ? 'lg' : 'xl'}
      minimizable
      minimized={minimized}
      onMinimize={() => setMinimized(true)}
      onRestore={() => setMinimized(false)}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          {!isEdit && (
            <Button variant="secondary" onClick={handleSaveAndNew} loading={saving}>
              Guardar y agregar otro
            </Button>
          )}
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">

        {/* Toggle express / completo */}
        {!isEdit && (
          <button
            type="button"
            onClick={() => setExpressMode(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-left cursor-pointer hover:bg-[var(--surface3)] transition-colors"
          >
            <p className="text-xs text-[var(--text2)]">
              {expressMode
                ? 'Modo express — escaneá el código, completá el nombre y guardá.'
                : 'Modo completo — todos los campos disponibles.'}
            </p>
            <span className="text-xs text-[var(--accent)] hover:opacity-80 transition-opacity flex-shrink-0 ml-3">
              {expressMode ? 'Ver más campos' : 'Modo express'}
            </span>
          </button>
        )}

        {/* ── MODO EXPRESS ── */}
        {expressMode && !isEdit && (
          <>
            {renderBarcodeField(true)}

            <Input
              ref={nameInputRef}
              label="Nombre *"
              value={form.name}
              onChange={set('name')}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  costPriceRef.current?.focus()
                }
              }}
              placeholder="Ej: Coca Cola 500ml"
              error={errors.name}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text2)]">Costo e IVA</p>
                <p className="text-xs text-[var(--text3)]">Las listas calculan sobre el costo con IVA</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  ref={costPriceRef}
                  label="Costo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price_net}
                  onChange={set('cost_price_net')}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (form.use_fixed_sell_price) sellPriceRef.current?.focus()
                      else if (priceLists.length === 0) handleSave()
                    }
                  }}
                  placeholder="0.00"
                  error={errors.cost_price_net}
                />
                <Select
                  label="IVA"
                  options={VAT_OPTIONS}
                  value={form.vat_rate}
                  onChange={set('vat_rate')}
                />
                <Input
                  label="Costo con IVA"
                  value={costWithVat ? String(costWithVat) : '0'}
                  readOnly
                  placeholder="0.00"
                  hint="Calculado automáticamente"
                />
              </div>
            </div>

            {form.price_mode === 'fixed' && (
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={form.use_fixed_sell_price}
                      onChange={e => {
                        const checked = e.target.checked
                        setForm(f => ({ ...f, use_fixed_sell_price: checked, sell_price: checked ? f.sell_price : '' }))
                        if (checked) setTimeout(() => sellPriceRef.current?.focus(), 30)
                      }}
                    />
                    <div className="w-9 h-5 rounded-full bg-[var(--border)] peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text)]">Precio de venta fijo</p>
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">Alt+F</kbd>
                    </div>
                    <p className="text-xs text-[var(--text3)]">Ideal cuando no usás márgenes.</p>
                  </div>
                </label>
                {form.use_fixed_sell_price && (
                  <Input
                    ref={sellPriceRef}
                    label="Precio de venta"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sell_price}
                    onChange={set('sell_price')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSave()
                      }
                    }}
                    placeholder="0.00"
                    error={errors.sell_price}
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* ── MODO COMPLETO / EDICIÓN ── */}
        {(!expressMode || isEdit) && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-6">

            {/* ─── Columna izquierda: Identificación + Clasificación ─── */}
            <div className="space-y-4 sm:border-r sm:border-[var(--border)] sm:pr-6">

              <SectionLabel>Identificación</SectionLabel>

              {renderBarcodeField(!isEdit)}

              <Input
                ref={nameInputRef}
                label="Nombre *"
                value={form.name}
                onChange={set('name')}
                placeholder="Ej: Coca Cola 500ml"
                error={errors.name}
                autoFocus={isEdit}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Código interno"
                  value={form.sku}
                  onChange={set('sku')}
                  placeholder="COC-500"
                />
                <Select
                  label="Unidad"
                  options={UNITS}
                  value={form.unit}
                  onChange={set('unit')}
                />
              </div>

              <div className="pt-2">
                <SectionLabel>Clasificación</SectionLabel>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Categoría</label>
                  <button
                    type="button"
                    onClick={() => { setNewCatName(''); setNewCatParent(form.category_id); setCategorySubModal(true) }}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                <CategoryTreePicker
                  categoryMap={categoryMap}
                  childrenMap={childrenMap}
                  value={form.category_id}
                  onChange={id => { setForm(f => ({ ...f, category_id: id })); setErrors(er => ({ ...er, category_id: '' })) }}
                  selectClass={selectClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Proveedor</label>
                  <button
                    type="button"
                    onClick={() => setSupplierSubModal(true)}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nuevo
                  </button>
                </div>
                <Select
                  options={supplierOptions}
                  value={form.supplier_id}
                  onChange={set('supplier_id')}
                  placeholder="Sin proveedor"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Marca</label>
                  <button
                    type="button"
                    onClick={() => { setNewBrandName(''); setBrandSubModal(true) }}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                <Select
                  options={brandOptions}
                  value={form.brand_id}
                  onChange={set('brand_id')}
                  placeholder="Sin marca"
                />
              </div>

            </div>

            {/* ─── Columna derecha: Precios + Stock + Descripción ─── */}
            <div className="space-y-4">

              <SectionLabel>Costos y precios</SectionLabel>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  ref={costPriceRef}
                  label="Costo neto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price_net}
                  onChange={set('cost_price_net')}
                  placeholder="0.00"
                  error={errors.cost_price_net}
                />
                <Select
                  label="IVA"
                  options={VAT_OPTIONS}
                  value={form.vat_rate}
                  onChange={set('vat_rate')}
                />
                <Input
                  label="c/ IVA"
                  value={costWithVat ? String(costWithVat) : '0'}
                  readOnly
                  placeholder="0.00"
                  hint="Auto"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Precio de venta</label>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">Alt+F</kbd>
                </div>
                <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
                  {PRICE_MODES.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriceMode(opt.value)}
                      className={cn(
                        'flex-1 px-3 py-2.5 text-center transition-colors',
                        i > 0 && 'border-l border-[var(--border)]',
                        currentPriceMode === opt.value
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text2)] hover:bg-[var(--surface2)]'
                      )}
                    >
                      <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                      <span className={cn('block text-[10px] mt-0.5 leading-tight', currentPriceMode === opt.value ? 'text-white/70' : 'text-[var(--text3)]')}>
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {currentPriceMode === 'fixed' && (
                <Input
                  ref={sellPriceRef}
                  label="Precio de venta"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sell_price}
                  onChange={set('sell_price')}
                  placeholder="0.00"
                  error={errors.sell_price}
                />
              )}

              {currentPriceMode === 'list' && costWithVat > 0 && priceLists.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface2)]/35 p-3 space-y-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text3)]">Precios por lista</p>
                    <p className="text-[10px] text-[var(--text3)]">Editá precio o porcentaje</p>
                  </div>
                  {priceLists.map(list => {
                    const calculated = Math.round(costWithVat * (1 + list.margin_pct / 100) * 100) / 100
                    const overrideVal = overridePrices[list.id] ?? ''
                    const displayPrice = overrideVal !== '' ? Number(overrideVal) : calculated
                    const gain = displayPrice - costWithVat
                    const isOverridden = overrideVal !== ''
                    const mode = overrideModes[list.id] ?? 'pesos'
                    const pctVal = overridePctValues[list.id] ?? ''
                    return (
                      <div key={list.id} className={cn(
                        'flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm transition-colors',
                        isOverridden
                          ? 'bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/25'
                          : 'bg-[var(--surface)]/75'
                      )}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[var(--text2)] truncate text-xs">{list.name}</p>
                            {isOverridden && (
                              <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent)]/12 px-1 py-0.5 rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--text3)]">
                            {mode === 'pct' && pctVal !== '' ? (
                              <>
                                +{pctVal}%{' '}
                                <span className="text-[var(--text2)] font-medium">
                                  = ${displayPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="ml-1 opacity-50">era +{list.margin_pct}%</span>
                              </>
                            ) : (
                              <>
                                +{list.margin_pct}%
                                {isOverridden && mode === 'pesos' && (
                                  <span className="ml-1 line-through opacity-50">${calculated.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                                )}
                                {' · '}${gain.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Toggle $ / % */}
                          <div className="flex rounded border border-[var(--border)] overflow-hidden text-[9px] font-bold">
                            <button
                              type="button"
                              title="Ingresar precio en pesos"
                              onClick={() => {
                                if (mode !== 'pesos') {
                                  setOverrideModes(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                }
                              }}
                              className={cn(
                                'px-1.5 py-0.5 transition-colors',
                                mode === 'pesos'
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'text-[var(--text3)] hover:bg-[var(--surface2)]'
                              )}
                            >$</button>
                            <button
                              type="button"
                              title="Ingresar margen en porcentaje"
                              onClick={() => {
                                if (mode !== 'pct') {
                                  setOverrideModes(prev => ({ ...prev, [list.id]: 'pct' }))
                                  if (overrideVal !== '' && costWithVat > 0) {
                                    const pct = ((Number(overrideVal) / costWithVat - 1) * 100).toFixed(2)
                                    setOverridePctValues(prev => ({ ...prev, [list.id]: pct }))
                                  }
                                }
                              }}
                              className={cn(
                                'px-1.5 py-0.5 border-l border-[var(--border)] transition-colors',
                                mode === 'pct'
                                  ? 'bg-[var(--accent)] text-white'
                                  : 'text-[var(--text3)] hover:bg-[var(--surface2)]'
                              )}
                            >%</button>
                          </div>

                          {mode === 'pesos' ? (
                            <>
                              <span className="text-[var(--text3)] text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={overrideVal}
                                onChange={e => {
                                  const v = e.target.value
                                  setOverridePrices(prev => {
                                    const next = { ...prev }
                                    if (v === '') delete next[list.id]
                                    else next[list.id] = v
                                    return next
                                  })
                                }}
                                placeholder={calculated.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                className={cn(
                                  'w-24 px-2 py-1 text-xs font-medium text-right rounded-[var(--radius-sm)] bg-[var(--surface)] border transition-colors focus:outline-none mono',
                                  isOverridden
                                    ? 'border-[var(--accent)]/40 text-[var(--accent)] focus:border-[var(--accent)]'
                                    : 'border-[var(--border)] text-[var(--text2)] focus:border-[var(--accent)]'
                                )}
                              />
                              {overrideVal !== '' && costWithVat > 0 && (
                                <span className="text-[9px] font-mono text-[var(--text3)]">
                                  = {((Number(overrideVal) / costWithVat - 1) * 100).toFixed(1)}%
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={pctVal}
                                onChange={e => {
                                  const v = e.target.value
                                  setOverridePctValues(prev => ({ ...prev, [list.id]: v }))
                                  if (v !== '' && !isNaN(Number(v)) && costWithVat > 0) {
                                    const pricePesos = Math.round(costWithVat * (1 + Number(v) / 100) * 100) / 100
                                    setOverridePrices(prev => ({ ...prev, [list.id]: String(pricePesos) }))
                                  } else if (v === '') {
                                    setOverridePrices(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                  }
                                }}
                                placeholder={list.margin_pct.toFixed(2)}
                                className={cn(
                                  'w-20 px-2 py-1 text-xs font-medium text-right rounded-[var(--radius-sm)] bg-[var(--surface)] border transition-colors focus:outline-none mono',
                                  pctVal !== ''
                                    ? 'border-[var(--accent)]/40 text-[var(--accent)] focus:border-[var(--accent)]'
                                    : 'border-[var(--border)] text-[var(--text2)] focus:border-[var(--accent)]'
                                )}
                              />
                              <span className="text-[var(--text3)] text-xs">%</span>
                            </>
                          )}

                          {isOverridden && (
                            <button
                              type="button"
                              onClick={() => {
                                setOverridePrices(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                setOverridePctValues(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                setOverrideModes(prev => { const n = { ...prev }; delete n[list.id]; return n })
                              }}
                              title="Restaurar precio calculado"
                              className="p-1 text-[var(--text3)] hover:text-[var(--danger,#ef4444)] transition-colors"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-2">
                <SectionLabel>Stock</SectionLabel>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Inicial"
                  type="number"
                  min="0"
                  step="1"
                  value={form.initial_stock}
                  onChange={set('initial_stock')}
                  placeholder="0"
                />
                <Input
                  label="Mínimo"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock_min}
                  onChange={set('stock_min')}
                  placeholder="0"
                  error={errors.stock_min}
                  hint="Alerta"
                />
                <Input
                  label="Máximo"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock_max}
                  onChange={set('stock_max')}
                  placeholder="9999"
                  error={errors.stock_max}
                />
              </div>

              <div className="pt-2">
                <SectionLabel>Descripción (opcional)</SectionLabel>
              </div>

              <textarea
                value={form.description}
                onChange={set('description')}
                placeholder="Descripción opcional del producto..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
              />

            </div>

          </div>
        )}

        {/* Historial de costos — solo en edición */}
        {isEdit && (
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
            <button
              type="button"
              onClick={handleCostHistoryToggle}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            >
              <span>Historial de costos por proveedor</span>
              <ChevronDown size={14} className={cn('transition-transform', costHistoryOpen && 'rotate-180')} />
            </button>

            {costHistoryOpen && (
              <div className="border-t border-[var(--border)]">
                {costHistoryLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                  </div>
                ) : costHistory.length === 0 ? (
                  <p className="text-xs text-[var(--text3)] text-center py-4">Sin historial de compras registrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Fecha</th>
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Proveedor</th>
                          <th className="text-right px-3 py-2 text-[var(--text3)] font-medium">P. orden</th>
                          <th className="text-right px-3 py-2 text-[var(--text3)] font-medium">Aplicado</th>
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Criterio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {costHistory.map(h => (
                          <tr key={h.id}>
                            <td className="px-3 py-2 mono text-[var(--text2)]">
                              {new Date(h.recorded_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 text-[var(--text)]">
                              {h.suppliers?.name ?? <span className="text-[var(--text3)]">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right mono text-[var(--text2)]">{formatCurrency(h.unit_cost)}</td>
                            <td className="px-3 py-2 text-right mono font-medium text-[var(--text)]">{formatCurrency(h.applied_cost)}</td>
                            <td className="px-3 py-2 text-[var(--text3)]">{DECISION_LABELS[h.decision] ?? h.decision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Sub-modal: Nuevo proveedor */}
      <SupplierModal
        open={supplierSubModal}
        onClose={() => setSupplierSubModal(false)}
        onSaved={handleSupplierSaved}
        zIndex={60}
      />

      {/* Sub-modal: Nueva categoría */}
      {categorySubModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Nueva categoría</h3>
            <Input
              label="Nombre *"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newCatName.trim() && !savingCat) handleCategoryQuickSave()
                }
              }}
              placeholder="Ej: Bebidas, Lácteos..."
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Categoría padre</label>
              <CategoryTreePicker
                categoryMap={categoryMap}
                childrenMap={childrenMap}
                value={newCatParent}
                onChange={setNewCatParent}
                rootLabel="Sin padre (categoría principal)"
                selectClass={selectClass}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setCategorySubModal(false)} disabled={savingCat}>Cancelar</Button>
              <Button onClick={handleCategoryQuickSave} loading={savingCat} disabled={!newCatName.trim()}>Crear categoría</Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal: Nueva marca */}
      {brandSubModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Nueva marca</h3>
            <Input
              label="Nombre *"
              value={newBrandName}
              onChange={e => setNewBrandName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (newBrandName.trim() && !savingBrand) handleBrandQuickSave()
                }
              }}
              placeholder="Ej: Arcor"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setBrandSubModal(false)} disabled={savingBrand}>Cancelar</Button>
              <Button onClick={handleBrandQuickSave} loading={savingBrand} disabled={!newBrandName.trim()}>Crear marca</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
