'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import type { Product, Category, Supplier } from '@/types'
import type { PriceList } from '@/app/price-lists/page'
import { SupplierModal } from '@/components/modules/SupplierModal'

interface ProductModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  product?: Product | null   // null = crear, Product = editar
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

const emptyForm = {
  name: '',
  sku: '',
  description: '',
  category_id: '',
  supplier_id: '',
  brand_id: '',
  cost_price: '',
  unit: 'unidad',
  price_mode: 'fixed' as 'fixed' | 'custom',
}

export function ProductModal({ open, onClose, onSaved, product }: ProductModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [newBarcode, setNewBarcode] = useState('')
  const newBarcodeRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [supplierSubModal, setSupplierSubModal] = useState(false)
  const [brandSubModal, setBrandSubModal] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)
  const [categorySubModal, setCategorySubModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')
  const [savingCat, setSavingCat] = useState(false)

  const isEdit = !!product

  // Cargar categorías y proveedores
  useEffect(() => {
    if (!open) return
    api.get<Category[]>('/api/products/categories').then(setCategories).catch(() => { })
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => { })
    api.get<PriceList[]>('/api/price-lists').then(setPriceLists).catch(() => { })
    api.get<{ id: string; name: string }[]>('/api/brands').then(setBrands).catch(() => { })
  }, [open])

  // Pre-cargar datos al editar
  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? '',
        description: product.description ?? '',
        category_id: product.category_id ?? '',
        supplier_id: product.supplier_id ?? '',
        brand_id: (product as Product & { brand_id?: string }).brand_id ?? '',
        cost_price: String(product.cost_price),
        unit: product.unit,
        price_mode: product.price_mode ?? 'fixed',
      })
      // Cargar barcodes completos desde el servidor
      api.get<Product>(`/api/products/${product.id}`)
        .then(full => {
          setBarcodes((full.product_barcodes ?? []).map(b => b.barcode))
        })
        .catch(() => {
          setBarcodes(product.barcode ? [product.barcode] : [])
        })
    } else {
      setForm(emptyForm)
      setBarcodes([])
    }
    setNewBarcode('')
    setErrors({})
  }, [product, open])

  const addBarcode = () => {
    const val = newBarcode.trim()
    if (!val) return
    if (barcodes.includes(val)) { toast.error('Ese código ya está cargado'); return }
    setBarcodes(prev => [...prev, val])
    setNewBarcode('')
    newBarcodeRef.current?.focus()
  }

  const removeBarcode = (idx: number) => setBarcodes(prev => prev.filter((_, i) => i !== idx))

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    if (Number(form.cost_price) < 0) errs.cost_price = 'Debe ser mayor a 0'
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const costPrice = Number(form.cost_price) || 0
      const defaultList = priceLists.find(l => l.is_default) ?? priceLists[0]
      const sellPrice = defaultList
        ? Math.round(costPrice * (1 + defaultList.margin_pct / 100) * 100) / 100
        : costPrice

      const payload = {
        name: form.name.trim(),
        barcodes,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        brand_id: form.brand_id || null,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock_current: form.price_mode === 'custom' ? 999999 : 0,
        stock_min: 0,
        stock_max: form.price_mode === 'custom' ? 999999 : 9999,
        unit: form.unit,
        price_mode: form.price_mode,
      }

      if (isEdit) {
        await api.patch(`/api/products/${product!.id}`, payload)
        toast.success('Producto actualizado')
      } else {
        await api.post('/api/products', payload)
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
    // auto-select el recién creado
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
      const updated = await api.get<Category[]>('/api/products/categories').catch(() => categories)
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

  // Cascada de categorías derivada de form.category_id
  const categoryMap = new Map(categories.map(c => [c.id, c]))

  // childrenMap: parent_id (null para raíz) → hijos
  const childrenMap = new Map<string | null, Category[]>()
  categories.forEach(c => {
    const key = c.parent_id ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(c)
  })

  // Reconstruir el path desde la raíz hasta la categoría seleccionada
  const categoryPath: string[] = []
  if (form.category_id) {
    let cur: string | undefined = form.category_id
    while (cur) {
      categoryPath.unshift(cur)
      cur = categoryMap.get(cur)?.parent_id ?? undefined
    }
  }

  // Cantidad de dropdowns: longitud del path + 1 si el último nodo tiene hijos, mínimo 1
  const lastSelected = categoryPath[categoryPath.length - 1] ?? null
  const hasMoreChildren = (childrenMap.get(lastSelected) ?? []).length > 0
  const numDropdowns = Math.max(1, categoryPath.length + (hasMoreChildren ? 1 : 0))

  const selectClass = 'w-full px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar producto' : 'Nuevo producto'}
      size="lg"
    >
      <div className="space-y-5">

        {/* Fila 1: Nombre + Unidad */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="Nombre *"
              value={form.name}
              onChange={set('name')}
              placeholder="Ej: Coca Cola 500ml"
              error={errors.name}
            />
          </div>
          <Select
            label="Unidad"
            options={UNITS}
            value={form.unit}
            onChange={set('unit')}
          />
        </div>

        {/* Fila 2: Códigos de barras + SKU */}
        <div className="grid grid-cols-2 gap-3">
          {/* Múltiples códigos de barras */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Códigos de barras (EAN)</label>
            {barcodes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {barcodes.map((b, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mono bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)]"
                  >
                    {b}
                    <button
                      type="button"
                      onClick={() => removeBarcode(i)}
                      className="text-[var(--text3)] hover:text-[var(--danger)] transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                ref={newBarcodeRef}
                type="text"
                value={newBarcode}
                onChange={e => setNewBarcode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcode() } }}
                placeholder="7790895000152"
                className="flex-1 min-w-0 px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors mono"
              />
              <button
                type="button"
                onClick={addBarcode}
                className="flex-shrink-0 px-2 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors"
                title="Agregar código"
              >
                <Plus size={14} />
              </button>
            </div>
            <p className="text-xs text-[var(--text3)]">Presioná Enter o + para agregar cada código</p>
          </div>
          <Input
            label="SKU interno"
            value={form.sku}
            onChange={set('sku')}
            placeholder="COC-500"
          />
        </div>

        {/* Fila 3: Categoría en cascada */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text2)]">Categoría</label>
            <button
              type="button"
              onClick={() => { setNewCatName(''); setNewCatParent(''); setCategorySubModal(true) }}
              title="Crear categoría"
              className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
            >
              <Plus size={12} /> Nueva
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: numDropdowns }).map((_, i) => {
              const parentId = i === 0 ? null : (categoryPath[i - 1] ?? null)
              const options = childrenMap.get(parentId) ?? []
              const selectedValue = categoryPath[i] ?? ''
              return (
                <select
                  key={i}
                  value={selectedValue}
                  disabled={options.length === 0}
                  onChange={e => {
                    const val = e.target.value
                    setForm(f => ({ ...f, category_id: val || categoryPath[i - 1] || '' }))
                    setErrors(er => ({ ...er, category_id: '' }))
                  }}
                  className={`${selectClass} flex-1 min-w-[110px]`}
                >
                  <option value="">{i === 0 ? 'Sin categoría' : 'General'}</option>
                  {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )
            })}
          </div>
        </div>

        {/* Fila 4: Precio + Proveedor + Marca */}
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Precio de costo"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={set('cost_price')}
            placeholder="0.00"
            error={errors.cost_price}
          />
          {/* Proveedor con botón + */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--text2)]">Proveedor</label>
              <button
                type="button"
                onClick={() => setSupplierSubModal(true)}
                title="Crear proveedor"
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
          {/* Marca con botón + */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--text2)]">Marca</label>
              <button
                type="button"
                onClick={() => { setNewBrandName(''); setBrandSubModal(true) }}
                title="Crear marca"
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

        {/* Precio libre toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div className="relative flex-shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.price_mode === 'custom'}
              onChange={e => setForm(f => ({ ...f, price_mode: e.target.checked ? 'custom' : 'fixed' }))}
            />
            <div className="w-9 h-5 rounded-full bg-[var(--border)] peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Precio libre por venta</p>
            <p className="text-xs text-[var(--text3)]">El cajero ingresa el precio en cada venta (ej: verdura, carne por peso)</p>
          </div>
        </label>

        {/* Precios por lista */}
        {form.price_mode === 'fixed' && form.cost_price && Number(form.cost_price) > 0 && categories.length >= 0 && (
          <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] space-y-1.5">
            <p className="text-xs font-medium text-[var(--text3)] mb-1">Precio según lista</p>
            {priceLists.slice(0, 3).map(list => {
              const price = Math.round(Number(form.cost_price) * (1 + list.margin_pct / 100) * 100) / 100
              const gain = price - Number(form.cost_price)
              return (
                <div key={list.id} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text2)]">{list.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text3)]">
                      +{list.margin_pct}% · ganancia ${gain.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="font-semibold mono text-[var(--accent)]">
                      ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Descripción */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text2)]">Descripción</label>
          <textarea
            value={form.description}
            onChange={set('description')}
            placeholder="Descripción opcional del producto..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
          />
        </div>

        {/* Acciones */}
        {/* Footer sticky dentro del scroll */}
        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>
              {isEdit ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </div>

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
              placeholder="Ej: Bebidas, Lácteos..."
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Categoría padre</label>
              <select
                value={newCatParent}
                onChange={e => setNewCatParent(e.target.value)}
                className="w-full px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              >
                <option value="">Sin padre (categoría principal)</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
